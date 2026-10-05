import {
  Activity,
  Diagram,
  DiagramEdge,
  DiagramNode,
  EventInfo,
  SagaInfo,
  Timer,
  bytesOver,
  formatMegabytes,
  nextId,
} from '@ariadne/core';
import {
  Call,
  callLine,
  callOf,
  descendants,
  firstSyntaxError,
  identifierName,
  lambdaBody,
  lastName,
  line,
  typeArguments,
} from './ast';
import { CSharpParser, SyntaxNode } from './parser';

export interface SourceFile {
  path: string;
  content: string;
}

export interface ImportWarning {
  path: string;
  line: number;
  message: string;
}

export interface SourceLocation {
  path: string;
  line: number;
}

export interface ImportedSaga {
  /** The state machine class, e.g. `OrderStateMachine`. */
  className: string;
  diagram: Diagram;
  /** Where each state (by node id) and transition (by edge id) is in the code. */
  locations: {
    states: Record<string, SourceLocation>;
    transitions: Record<string, SourceLocation>;
  };
}

export interface ImportResult {
  sagas: ImportedSaga[];
  warnings: ImportWarning[];
}

/** What the importer reads: a bigger file is skipped with a warning (generated code, a mistake). */
export const IMPORT_LIMITS = { maxFileBytes: 2_000_000 } as const;

const INITIAL = 'Initial';
const FINAL = 'Final';

/** A class as written in one file (a partial class has several). */
interface ClassPart {
  path: string;
  node: SyntaxNode;
  namespace: string | undefined;
}

/**
 * Builds a diagram from every MassTransit saga state machine (`MassTransitStateMachine<T>`) in the
 * given files. Partial classes are merged; helper methods of the class are followed; what cannot
 * be shown comes back as a warning with its place, never as a failure.
 *
 * Only the syntax is read: nothing is resolved across files that are not given, so a state machine
 * derived from another base class is not found (that is said in a warning).
 */
export function importSagas(files: readonly SourceFile[], parser: CSharpParser): ImportResult {
  const warnings: ImportWarning[] = [];
  const classes = new Map<string, ClassPart[]>();
  for (const file of files) {
    const bytes = bytesOver(file.content, IMPORT_LIMITS.maxFileBytes);
    if (bytes !== undefined) {
      warnings.push({
        path: file.path,
        line: 1,
        message: `This file is ${formatMegabytes(bytes)}; Ariadne imports C# files up to ${formatMegabytes(IMPORT_LIMITS.maxFileBytes)}. It was skipped.`,
      });
      continue;
    }
    let root: SyntaxNode;
    try {
      root = parser.parse(file.content);
    } catch (e) {
      warnings.push({ path: file.path, line: 1, message: (e as Error).message });
      continue;
    }
    const broken = root.hasError ? firstSyntaxError(root) : null;
    if (broken) {
      warnings.push({
        path: file.path,
        line: line(broken),
        message: 'This is not valid C# here, so what follows may be missing from the diagram.',
      });
    }
    collectClasses(root.namedChildren, file.path, undefined, classes);
  }

  const sagas: ImportedSaga[] = [];
  for (const [name, parts] of classes) {
    const instanceType = sagaInstanceType(parts);
    if (instanceType === undefined) {
      warnForUnknownBase(name, parts, warnings);
      continue;
    }
    sagas.push(new SagaReader(name, instanceType, parts, warnings).read());
  }
  return { sagas, warnings };
}

// ---- finding the classes

function collectClasses(
  children: readonly SyntaxNode[],
  path: string,
  namespace: string | undefined,
  into: Map<string, ClassPart[]>,
): void {
  for (const [index, child] of children.entries()) {
    if (child.type === 'class_declaration') {
      const name = nameOf(child.childForFieldName('name'));
      if (name) into.set(name, [...(into.get(name) ?? []), { path, node: child, namespace }]);
      // Nested classes are not state machines of their own here.
    } else if (child.type === 'namespace_declaration') {
      const ns = child.childForFieldName('name')?.text;
      const body = child.childForFieldName('body');
      collectClasses(body?.namedChildren ?? [], path, joinNamespace(namespace, ns), into);
    } else if (child.type === 'file_scoped_namespace_declaration') {
      // Everything after the declaration belongs to it.
      const ns = child.childForFieldName('name')?.text;
      collectClasses(children.slice(index + 1), path, joinNamespace(namespace, ns), into);
      return;
    }
  }
}

/** The name an identifier node stands for (without the `@` of a verbatim identifier). */
const nameOf = (node: SyntaxNode | null | undefined): string | undefined =>
  node ? identifierName(node.text) : undefined;

const joinNamespace = (outer: string | undefined, inner: string | undefined) =>
  [outer, inner].filter(Boolean).join('.') || undefined;

function baseTypes(part: ClassPart): SyntaxNode[] {
  const list = part.node.namedChildren.find((c) => c.type === 'base_list');
  return list ? list.namedChildren : [];
}

/** `OrderState` for a class derived from `MassTransitStateMachine<OrderState>`. */
function sagaInstanceType(parts: readonly ClassPart[]): string | undefined {
  for (const part of parts) {
    for (const base of baseTypes(part)) {
      const generic = base.type === 'qualified_name' ? base.namedChildren.at(-1) : base;
      if (generic?.type === 'generic_name' && lastName(generic) === 'MassTransitStateMachine') {
        return typeArguments(generic)[0];
      }
    }
  }
  return undefined;
}

/** A class with a constructor full of `Initially`/`During` that derives from an unknown base. */
function warnForUnknownBase(name: string, parts: readonly ClassPart[], warnings: ImportWarning[]) {
  for (const part of parts) {
    // A generic base, or a plain name (a `using` alias, or a base class in another file).
    const base = baseTypes(part).find((b) => b.type === 'generic_name' || b.type === 'identifier');
    if (!base) continue;
    const usesDsl = [...descendants(part.node)].some((n) => {
      const call = callOf(n);
      return !call?.receiver && ['Initially', 'During', 'DuringAny'].includes(call?.name ?? '');
    });
    if (usesDsl) {
      warnings.push({
        path: part.path,
        line: line(part.node),
        message: `${name} derives from ${base.text}, which is not a MassTransitStateMachine in the given files. If it is one through another base class, add the file with that class.`,
      });
    }
  }
}

// ---- reading one saga

/** One way out of an `If`/`IfElse`: its condition, where it leads, what it sends. */
interface Branch {
  guard?: string;
  target: string | undefined;
  activities: Activity[];
}

interface Chain {
  /** The calls of `When(E).A().B()`, outermost last. */
  calls: Call[];
}

interface Transition {
  source: string;
  target: string | undefined;
  event: string;
  guard?: string;
  activities: Activity[];
  /** The requests made on entering the target, by name. */
  requests: string[];
  /** The timeouts scheduled or cancelled on entering the target, in order. */
  timers: Pick<Timer, 'action' | 'name'>[];
  at: SourceLocation;
}

/**
 * The text of a TODO comment ("TODO guard: X" or "TODO timeout: X" in a block comment) right after `node`. Ariadne writes the text of a
 * guard or a timeout there, so that a round trip keeps what the diagram said.
 */
function todoNote(node: SyntaxNode, kind: string): string | undefined {
  const comments: string[] = [];
  for (let n: SyntaxNode | null = node; n && !comments.length; n = n.parent) {
    for (let next = n.nextSibling; next?.type === 'comment'; next = next.nextSibling) {
      comments.push(next.text);
    }
    if (n.type === 'argument_list') break;
  }
  const found = comments.join(' ').match(new RegExp(`^/\\*\\s*TODO ${kind}:\\s*(.*?)\\s*\\*/$`));
  return found ? found[1].replace(/\* \//g, '*/') : undefined;
}

/** The text of a guard: the body of its lambda; a generated `true` gives the guard it stands for. */
function guardText(lambda: SyntaxNode): string {
  const body = lambdaBody(lambda) ?? lambda;
  const text = body.text.replace(/\s+/g, ' ');
  return (text === 'true' ? todoNote(body, 'guard') : undefined) ?? text;
}

const REQUEST_OUTCOMES: readonly string[] = ['Completed', 'Faulted', 'TimeoutExpired'];

/**
 * The event a `When(…)` waits for: `Ask.Completed` keeps the request it belongs to, and the
 * timeout `Reminder.Received` is the event `Reminder`.
 */
function eventName(node: SyntaxNode | null): string | null {
  const name = lastName(node);
  if (node?.type === 'member_access_expression' && name) {
    const owner = lastName(node.childForFieldName('expression'));
    if (owner && REQUEST_OUTCOMES.includes(name)) return `${owner}.${name}`;
    if (owner && name === 'Received') return owner;
  }
  return name;
}

const DURATION_UNITS: Record<string, string> = {
  Milliseconds: 'ms',
  Seconds: 's',
  Minutes: 'm',
  Hours: 'h',
  Days: 'd',
};

/** `TimeSpan.FromSeconds(30)` as `30s`; a TODO note (`kind`) or else the code as it is written. */
function durationText(node: SyntaxNode, kind = 'timeout'): string {
  const note = todoNote(node, kind);
  if (note) return note;
  const text = node.text.replace(/\s+/g, ' ');
  const found = text.match(/^TimeSpan\.From(\w+)\(\s*(\d+(?:\.\d+)?)\s*\)$/);
  const unit = found ? DURATION_UNITS[found[1]] : undefined;
  if (found && unit) return `${found[2]}${unit}`;
  return text;
}

/** Prefix of the key of a join among the states: no state can be called that. */
const JOIN = 'join:';

const UNSUPPORTED = new Set(['IfAsync', 'IfElseAsync', 'Switch']);

class SagaReader {
  private readonly states = new Map<string, SourceLocation>();
  private readonly events = new Map<string, { messageType: string; correlation?: string }>();
  private readonly methods = new Map<string, SyntaxNode>();
  private readonly transitions: Transition[] = [];
  private readonly enterActivities = new Map<string, Activity[]>();
  private readonly enterRequests = new Map<string, string[]>();
  private readonly enterTimers = new Map<string, Pick<Timer, 'action' | 'name'>[]>();
  private readonly requests = new Map<string, { timeout?: string }>();
  private readonly schedules = new Map<string, { delay?: string }>();
  /** `CompositeEvent(() => X, …, A, B)`: X, the events it waits for, and where it is declared. */
  private readonly composites = new Map<string, { events: string[]; at: SourceLocation }>();
  private readonly ignores = new Map<string, string[]>();
  private readonly said = new Set<string>();
  private stateProperty: string | undefined;
  private usesAny = false;
  private usesFinal = false;

  constructor(
    private readonly className: string,
    private readonly instanceType: string,
    private readonly parts: readonly ClassPart[],
    private readonly warnings: ImportWarning[],
  ) {}

  read(): ImportedSaga {
    const constructors: { part: ClassPart; node: SyntaxNode }[] = [];
    for (const part of this.parts) {
      const body = part.node.childForFieldName('body');
      for (const member of body?.namedChildren ?? []) {
        if (member.type === 'property_declaration' || member.type === 'field_declaration') {
          this.readMember(member, part);
        } else if (member.type === 'method_declaration') {
          const name = nameOf(member.childForFieldName('name'));
          if (name && !this.methods.has(name)) this.methods.set(name, member);
        } else if (member.type === 'constructor_declaration') {
          constructors.push({ part, node: member });
        }
      }
    }
    for (const { part, node } of constructors) this.readConstructor(node, part);
    return this.build();
  }

  // ---- declarations

  private readMember(member: SyntaxNode, part: ClassPart): void {
    const type = member.childForFieldName('type');
    const names: string[] = [];
    if (member.type === 'property_declaration') {
      const name = nameOf(member.childForFieldName('name'));
      if (name) names.push(name);
    } else {
      const declaration = member.namedChildren.find((c) => c.type === 'variable_declaration');
      for (const d of declaration?.namedChildren.filter((c) => c.type === 'variable_declarator') ??
        []) {
        const name = nameOf(d.namedChildren.find((c) => c.type === 'identifier'));
        if (name) names.push(name);
      }
    }
    const typeNode =
      type ??
      member.namedChildren
        .find((c) => c.type === 'variable_declaration')
        ?.childForFieldName('type') ??
      null;
    const typeName = lastName(typeNode);
    for (const name of names) {
      if (typeName === 'State') this.states.set(name, { path: part.path, line: line(member) });
      else if (typeName === 'Event') {
        this.events.set(name, { messageType: typeArguments(typeNode)[0] ?? name });
      }
    }
  }

  // ---- the constructor

  private readConstructor(ctor: SyntaxNode, part: ClassPart): void {
    const body = ctor.childForFieldName('body');
    for (const statement of body?.namedChildren ?? []) {
      const call = callOf(
        statement.type === 'expression_statement' ? (statement.namedChildren[0] ?? null) : null,
      );
      if (!call || call.receiver) continue;
      const at = { path: part.path, line: callLine(call) };
      switch (call.name) {
        case 'InstanceState':
          this.readInstanceState(call);
          break;
        case 'Event':
          this.readEvent(call);
          break;
        case 'Initially':
          this.readBlock([INITIAL], call.args, at);
          break;
        case 'During':
          this.readDuring(call, at);
          break;
        case 'DuringAny':
          this.usesAny = true;
          this.readBlock(['*'], call.args, at);
          break;
        case 'WhenEnter':
          this.readWhenEnter(call, at);
          break;
        case 'Request':
          this.readRequest(call, at);
          break;
        case 'Schedule':
          this.readSchedule(call, at);
          break;
        case 'SetCompletedWhenFinalized':
        case 'SetCompleted':
          break;
        case 'CompositeEvent':
          this.readComposite(call, at);
          break;
        case 'WhenLeave':
        case 'WhenEnterAny':
        case 'WhenLeaveAny':
        case 'BeforeEnter':
        case 'AfterLeave':
        case 'Finally':
        case 'Fault':
        case 'OnUnhandledEvent':
          this.warn(at, `${call.name}(…) is not shown in the diagram yet.`);
          break;
        default:
          break;
      }
    }
  }

  private readInstanceState(call: Call): void {
    const lambda = call.args[0];
    const body = lambda ? lambdaBody(lambda) : null;
    if (body?.type === 'member_access_expression') this.stateProperty = lastName(body) ?? undefined;
  }

  /** `Request(() => Ask, x => x.RequestId, r => r.Timeout = …)`: a request and how long it waits. */
  private readRequest(call: Call, at: SourceLocation): void {
    const lambda = call.args[0];
    const name = lambda ? lastName(lambdaBody(lambda)) : null;
    if (!name) {
      this.warn(at, 'Request(…) names no request that could be read.');
      return;
    }
    let timeout: string | undefined;
    for (const arg of call.args.slice(1)) {
      for (const node of [arg, ...descendants(arg)]) {
        const right =
          node.type === 'assignment_expression' ? node.childForFieldName('right') : null;
        if (right && lastName(node.childForFieldName('left')) === 'Timeout') {
          timeout = durationText(right);
        }
      }
    }
    this.requests.set(name, timeout ? { timeout } : {});
  }

  /** `CompositeEvent(() => Ready, x => x.Status, A, B)`: the join `Ready` and the events it waits for. */
  private readComposite(call: Call, at: SourceLocation): void {
    const lambda = call.args[0];
    const name = lambda ? lastName(lambdaBody(lambda)) : null;
    if (!name) {
      this.warn(at, 'CompositeEvent(…) names no event that could be read.');
      return;
    }
    const events: string[] = [];
    for (const arg of call.args.slice(2)) {
      if (arg.type === 'member_access_expression' && /^CompositeEventOptions\b/.test(arg.text)) {
        this.warn(at, `${arg.text} is not shown in the diagram.`);
        continue;
      }
      const event = eventName(arg);
      if (event) events.push(event);
    }
    if (events.length < 2) {
      this.warn(
        at,
        `CompositeEvent(${name}, …) waits for fewer than two events that could be read.`,
      );
    }
    this.composites.set(name, { events, at });
  }

  /** `Schedule(() => Reminder, x => x.TokenId, s => s.Delay = …)`: a timeout and when it fires. */
  private readSchedule(call: Call, at: SourceLocation): void {
    const lambda = call.args[0];
    const name = lambda ? lastName(lambdaBody(lambda)) : null;
    if (!name) {
      this.warn(at, 'Schedule(…) names no timeout that could be read.');
      return;
    }
    let delay: string | undefined;
    for (const arg of call.args.slice(1)) {
      for (const node of [arg, ...descendants(arg)]) {
        const right =
          node.type === 'assignment_expression' ? node.childForFieldName('right') : null;
        if (right && lastName(node.childForFieldName('left')) === 'Delay') {
          delay = durationText(right, 'delay');
        }
      }
    }
    this.schedules.set(name, delay ? { delay } : {});
  }

  /** `Schedule(Reminder, …)` or `Unschedule(Reminder)` in a chain, as a timer of the state. */
  private timerIn(call: Call, place: SourceLocation): Pick<Timer, 'action' | 'name'> | undefined {
    const name = lastName(call.args[0] ?? null);
    if (!name) {
      this.warn(place, `${call.name}(…) names no timeout that could be read.`);
      return undefined;
    }
    return { action: call.name === 'Schedule' ? 'schedule' : 'unschedule', name };
  }

  /** `Request(Ask, context => new Ask(…))` in a chain: the request, by name. */
  private requestIn(call: Call, place: SourceLocation): string | undefined {
    const name = lastName(call.args[0] ?? null);
    if (!name) this.warn(place, 'Request(…) names no request that could be read.');
    return name ?? undefined;
  }

  /** `Event(() => X, x => x.CorrelateById(…))`: what correlates the event. */
  private readEvent(call: Call): void {
    const lambda = call.args[0];
    const name = lambda ? lastName(lambdaBody(lambda)) : null;
    if (!name) return;
    const known = this.events.get(name) ?? { messageType: call.typeArgs[0] ?? name };
    const configure = call.args[1];
    if (configure) {
      for (const node of [configure, ...descendants(configure)]) {
        const inner = callOf(node);
        if (inner && ['CorrelateById', 'CorrelateBy'].includes(inner.name)) {
          known.correlation =
            `${inner.name}${node.childForFieldName('arguments')?.text ?? '()'}`.replace(
              /\s+/g,
              ' ',
            );
          break;
        }
      }
    }
    this.events.set(name, known);
  }

  private readDuring(call: Call, at: SourceLocation): void {
    const sources: string[] = [];
    let rest = call.args;
    while (rest.length > 0 && this.isStateRef(rest[0])) {
      sources.push(lastName(rest[0])!);
      rest = rest.slice(1);
    }
    if (sources.length === 0) {
      this.warn(at, 'During(…) without a state that could be read.');
      return;
    }
    this.readBlock(sources, rest, at);
  }

  private isStateRef(node: SyntaxNode): boolean {
    if (node.type !== 'identifier' && node.type !== 'member_access_expression') return false;
    const name = lastName(node);
    return !!name && (name === INITIAL || name === FINAL || this.states.has(name));
  }

  private readBlock(sources: string[], handlers: SyntaxNode[], at: SourceLocation): void {
    for (const handler of handlers) {
      const chain = this.flatten(handler, 0);
      if (!chain || chain.calls.length === 0) {
        this.warn(
          { path: at.path, line: line(handler) },
          `Could not read this handler: ${short(handler.text)}`,
        );
        continue;
      }
      const first = chain.calls[0];
      if (first.name === 'Ignore') {
        const event = lastName(first.args[0] ?? null);
        for (const source of sources) {
          if (event && source !== '*' && source !== INITIAL) {
            this.ignores.set(source, [...(this.ignores.get(source) ?? []), event]);
          } else {
            this.warn(
              { path: at.path, line: callLine(first) },
              `Ignore(${event ?? '…'}) is not drawn for this state.`,
            );
          }
        }
        continue;
      }
      if (first.name !== 'When') {
        this.warn(
          { path: at.path, line: callLine(first) },
          `${first.name}(…) is not shown in the diagram yet.`,
        );
        continue;
      }
      this.readWhen(sources, chain, at);
    }
  }

  /** One `When(E)…` chain: a transition from each source. */
  private readWhen(sources: string[], chain: Chain, at: SourceLocation): void {
    const [when, ...calls] = chain.calls;
    const event = eventName(when.args[0] ?? null);
    if (!event) {
      this.warn(
        { path: at.path, line: callLine(when) },
        'This When(…) names no event that could be read.',
      );
      return;
    }
    let guard: string | undefined;
    const filter = when.args[1];
    if (filter) {
      guard = guardText(filter);
    }
    let target: string | undefined;
    const activities: Activity[] = [];
    const requests: string[] = [];
    const timers: Pick<Timer, 'action' | 'name'>[] = [];
    const branches: Branch[] = [];
    for (const call of calls) {
      const place = { path: at.path, line: callLine(call) };
      if (call.name === 'If' || call.name === 'IfElse') {
        branches.push(...this.readIf(call, place));
      } else if (call.name === 'TransitionTo') {
        target = lastName(call.args[0] ?? null) ?? undefined;
        if (!target) this.warn(place, 'TransitionTo(…) names no state that could be read.');
      } else if (call.name === 'Finalize') {
        target = FINAL;
      } else if (['Send', 'SendAsync', 'Publish', 'PublishAsync'].includes(call.name)) {
        const activity = this.activityOf(call, place);
        if (activity) activities.push(activity);
      } else if (call.name === 'Request') {
        const request = this.requestIn(call, place);
        if (request) requests.push(request);
      } else if (call.name === 'Schedule' || call.name === 'Unschedule') {
        const timer = this.timerIn(call, place);
        if (timer) timers.push(timer);
      } else if (UNSUPPORTED.has(call.name)) {
        this.warn(place, `${call.name}(…) is not shown in the diagram yet.`);
      } else {
        this.warnOnce(place, `${call.name}(…) runs code; it is left out of the diagram.`);
      }
    }
    // `If(c, then…)` and `IfElse(c, then…, else…)`: a transition per branch, each with its guard.
    // What follows an `If` (`.TransitionTo(B)`) is the way out when no condition holds.
    const ways: Branch[] = [...branches];
    if (branches.length > 0) {
      const guard = branches.length === 1 ? `!(${branches[0].guard})` : 'otherwise';
      if (target) ways.push({ guard, target, activities: [] });
    } else {
      ways.push({ guard, target, activities: [] });
    }
    for (const way of ways) {
      if (way.target === FINAL) this.usesFinal = true;
      for (const source of sources) {
        this.transitions.push({
          source,
          target: way.target,
          event,
          ...(way.guard ? { guard: way.guard } : {}),
          activities: [...activities, ...way.activities],
          requests,
          timers,
          at: { path: at.path, line: callLine(when) },
        });
      }
    }
  }

  /** `If(c, then => …)` / `IfElse(c, then => …, otherwise => …)`: one branch per lambda. */
  private readIf(call: Call, place: SourceLocation): Branch[] {
    const isElse = call.name === 'IfElse';
    const condition = call.args[0];
    const lambdas = call.args.slice(1, isElse ? 3 : 2);
    if (!condition || lambdas.length < (isElse ? 2 : 1)) {
      this.warn(place, `${call.name}(…) could not be read.`);
      return [];
    }
    const text = guardText(condition);
    const branches = lambdas.map((lambda, index): Branch => {
      const branch: Branch = {
        guard: index === 0 ? text : `!(${text})`,
        target: undefined,
        activities: [],
      };
      const inner = this.flatten(
        lambda.type === 'lambda_expression' ? lambdaBody(lambda) : null,
        0,
      );
      for (const step of inner?.calls ?? []) {
        const at = { path: place.path, line: callLine(step) };
        if (step.name === 'TransitionTo') {
          branch.target = lastName(step.args[0] ?? null) ?? undefined;
          if (!branch.target) this.warn(at, 'TransitionTo(…) names no state that could be read.');
        } else if (step.name === 'Finalize') {
          branch.target = FINAL;
        } else if (['Send', 'SendAsync', 'Publish', 'PublishAsync'].includes(step.name)) {
          const activity = this.activityOf(step, at);
          if (activity) branch.activities.push(activity);
        } else if (UNSUPPORTED.has(step.name) || step.name === 'If' || step.name === 'IfElse') {
          this.warn(at, `${step.name}(…) is not shown in the diagram yet.`);
        } else {
          this.warnOnce(at, `${step.name}(…) runs code; it is left out of the diagram.`);
        }
      }
      return branch;
    });
    return branches;
  }

  private readWhenEnter(call: Call, at: SourceLocation): void {
    const state = lastName(call.args[0] ?? null);
    const lambda = call.args[1];
    const body = lambda?.type === 'lambda_expression' ? lambdaBody(lambda) : null;
    if (!state || !body) {
      this.warn(at, 'WhenEnter(…) could not be read.');
      return;
    }
    if (state === INITIAL || state === FINAL) {
      this.warn(
        at,
        `WhenEnter(${state}, …): nothing is shown in the ${state === INITIAL ? 'initial' : 'final'} state.`,
      );
      return;
    }
    const chain = this.flatten(body, 0);
    for (const inner of chain?.calls ?? []) {
      const place = { path: at.path, line: callLine(inner) };
      if (['Send', 'SendAsync', 'Publish', 'PublishAsync'].includes(inner.name)) {
        const activity = this.activityOf(inner, place);
        if (activity) {
          this.enterActivities.set(state, [...(this.enterActivities.get(state) ?? []), activity]);
        }
      } else if (inner.name === 'Schedule' || inner.name === 'Unschedule') {
        const timer = this.timerIn(inner, place);
        if (timer) this.enterTimers.set(state, [...(this.enterTimers.get(state) ?? []), timer]);
      } else if (inner.name === 'Request') {
        const request = this.requestIn(inner, place);
        if (request)
          this.enterRequests.set(state, [...(this.enterRequests.get(state) ?? []), request]);
      } else {
        this.warnOnce(place, `${inner.name}(…) runs code; it is left out of the diagram.`);
      }
    }
  }

  // ---- chains and helper methods

  /**
   * `When(E).Then(…).TransitionTo(S)` as a list of calls. A call to a method of the class is
   * replaced by that method's body (its parameter standing for the chain passed in).
   */
  private flatten(node: SyntaxNode | null, depth: number): Chain | null {
    if (!node || depth > 6) return null;
    if (node.type === 'parenthesized_expression')
      return this.flatten(node.namedChildren[0] ?? null, depth);
    const call = callOf(node);
    if (!call) return null;
    if (call.receiver) {
      const before = this.flatten(call.receiver, depth);
      return { calls: [...(before?.calls ?? []), call] };
    }
    const method = this.methods.get(call.name);
    if (method && !['When', 'Ignore'].includes(call.name)) return this.inline(method, call, depth);
    return { calls: [call] };
  }

  private inline(method: SyntaxNode, call: Call, depth: number): Chain | null {
    const arrow = method.namedChildren.find((c) => c.type === 'arrow_expression_clause');
    const block = method.childForFieldName('body');
    const returned =
      arrow?.namedChildren[0] ??
      block?.namedChildren.find((c) => c.type === 'return_statement')?.namedChildren[0] ??
      null;
    if (!returned) return null;
    const params =
      method
        .childForFieldName('parameters')
        ?.namedChildren.map((p) => nameOf(p.childForFieldName('name'))) ?? [];
    const body = this.flattenWith(
      returned,
      new Map(params.slice(0, 1).map((p) => [p ?? '', call.args[0] ?? null])),
      depth + 1,
    );
    return body;
  }

  /** Like `flatten`, with a parameter name standing for the chain passed to a helper method. */
  private flattenWith(
    node: SyntaxNode,
    bound: Map<string, SyntaxNode | null>,
    depth: number,
  ): Chain | null {
    const call = callOf(node);
    if (!call) {
      const name = node.type === 'identifier' ? identifierName(node.text) : null;
      const arg = name ? bound.get(name) : undefined;
      return arg ? this.flatten(arg, depth) : null;
    }
    if (call.receiver) {
      const before = this.flattenWith(call.receiver, bound, depth);
      return { calls: [...(before?.calls ?? []), call] };
    }
    return this.flatten(node, depth);
  }

  // ---- activities

  private activityOf(call: Call, at: SourceLocation): Activity | null {
    const kind = call.name.startsWith('Send') ? 'command' : 'event';
    const type = call.typeArgs[0] ?? messageTypeIn(call.args);
    if (!type) {
      this.warn(at, `The message type of ${call.name}(…) could not be read.`);
      return null;
    }
    return { kind, name: type };
  }

  // ---- the diagram

  private build(): ImportedSaga {
    const locations: ImportedSaga['locations'] = { states: {}, transitions: {} };
    const nodes: DiagramNode[] = [{ id: 'start-1', type: 'start', name: INITIAL }];
    const ids = new Map<string, string>([[INITIAL, 'start-1']]);

    const flow = this.resolveJoins();
    const stateNames = [...this.states.keys()];
    // States used but not declared in the given files (e.g. inherited) still get a node.
    for (const t of flow) {
      for (const name of [t.source, t.target]) {
        if (
          name &&
          !['*', INITIAL, FINAL].includes(name) &&
          !name.startsWith(JOIN) &&
          !this.states.has(name)
        ) {
          this.states.set(name, t.at);
          stateNames.push(name);
          this.warn(t.at, `The state ${name} is not declared in the given files.`);
        }
      }
    }
    for (const name of stateNames) {
      const id = uniqueId(`state-${slug(name)}`, nodes);
      ids.set(name, id);
      const node: DiagramNode = { id, type: 'state', name };
      nodes.push(node);
      locations.states[id] = this.states.get(name)!;
    }
    if (this.usesFinal) {
      nodes.push({ id: 'end-1', type: 'end', name: FINAL });
      ids.set(FINAL, 'end-1');
    }
    if (this.usesAny) {
      nodes.push({ id: 'any-1', type: 'any', name: 'Any state' });
      ids.set('*', 'any-1');
    }
    for (const name of this.joinsIn(flow)) {
      const id = uniqueId(`join-${slug(name)}`, nodes);
      nodes.push({ id, type: 'join', name });
      ids.set(`${JOIN}${name}`, id);
    }

    // Activities belong to the state a transition leads into; WhenEnter ones to their state.
    const entering = new Map<string, Activity[][]>();
    const requesting = new Map<string, string[][]>();
    const timing = new Map<string, string[][]>();
    const edges: DiagramEdge[] = [];
    for (const t of flow) {
      const source = ids.get(t.source)!;
      const target = t.target === undefined ? t.source : t.target;
      if (t.source === '*' && t.target === undefined) {
        this.warn(t.at, `DuringAny(When(${t.event})…) leads nowhere: not drawn.`);
        continue;
      }
      if (target === INITIAL || (t.target === undefined && t.source === INITIAL)) {
        this.warn(t.at, `When(${t.event}) stays in or returns to the initial state: not drawn.`);
        continue;
      }
      if (t.target === undefined && t.source === FINAL) continue;
      const targetId = ids.get(target)!;
      const id = `edge-${edges.length + 1}`;
      edges.push({
        id,
        source,
        target: targetId,
        kind: 'forward',
        event: t.event,
        ...(t.guard ? { guard: t.guard } : {}),
      });
      locations.transitions[id] = t.at;
      const things = [
        ...t.activities.map((a) => a.name),
        ...t.requests,
        ...t.timers.map((x) => `${x.action} ${x.name}`),
      ];
      if (target.startsWith(JOIN)) {
        if (things.length) {
          this.warn(
            t.at,
            `${things.join(', ')} on ${t.event}, which counts towards the join ${target.slice(JOIN.length)}, cannot be shown.`,
          );
        }
      } else if (target === FINAL) {
        if (things.length) {
          this.warn(
            t.at,
            `${things.join(', ')} on the way to the final state cannot be shown: nothing happens in a final state.`,
          );
        }
      } else {
        entering.set(target, [...(entering.get(target) ?? []), t.activities]);
        requesting.set(target, [...(requesting.get(target) ?? []), t.requests]);
        timing.set(target, [
          ...(timing.get(target) ?? []),
          t.timers.map((x) => `${x.action}:${x.name}`),
        ]);
        if (t.target === undefined && things.length) {
          this.warn(
            t.at,
            `${t.event} keeps the saga in ${t.source}; ${things.join(', ')} is shown on entering it.`,
          );
        }
      }
    }

    for (const node of nodes) {
      if (node.type !== 'state') continue;
      const name = node.name;
      const fromEnter = this.enterActivities.get(name) ?? [];
      const lists = entering.get(name) ?? [];
      const merged = dedupe([...fromEnter, ...lists.flat()]);
      if (merged.length) node.activities = merged;
      const asked = requesting.get(name) ?? [];
      const requests = dedupe([...(this.enterRequests.get(name) ?? []), ...asked.flat()]);
      if (requests.length) {
        node.requests = requests.map((request) => ({
          name: request,
          ...(this.requests.get(request)?.timeout
            ? { timeout: this.requests.get(request)!.timeout }
            : {}),
        }));
      }
      const timed = timing.get(name) ?? [];
      const timers = dedupe([
        ...(this.enterTimers.get(name) ?? []).map((x) => `${x.action}:${x.name}`),
        ...timed.flat(),
      ]);
      if (timers.length) {
        node.timers = timers.map((key): Timer => {
          const [action, timer] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
          const delay = action === 'schedule' ? this.schedules.get(timer)?.delay : undefined;
          return { action: action as Timer['action'], name: timer, ...(delay ? { delay } : {}) };
        });
      }
      const distinct = new Set(
        lists.map(
          (l, i) =>
            l.map((a) => `${a.kind}:${a.name}`).join(',') +
            `|${(asked[i] ?? []).join(',')}|${(timed[i] ?? []).join(',')}`,
        ),
      );
      if (distinct.size > 1) {
        this.warn(
          this.states.get(name)!,
          `Transitions into ${name} do different things; the diagram shows them all on the state.`,
        );
      }
      const ignored = dedupe(this.ignores.get(name)?.map((e) => e) ?? []);
      if (ignored.length) node.ignores = ignored;
    }

    const saga: SagaInfo = {
      className: this.className,
      ...(this.parts[0].namespace ? { namespace: this.parts[0].namespace } : {}),
      instanceType: this.instanceType,
      ...(this.stateProperty ? { stateProperty: this.stateProperty } : {}),
    };
    const events: EventInfo[] = [];
    for (const [name, info] of this.events) {
      const entry: EventInfo = {
        name,
        ...(info.messageType !== name ? { messageType: info.messageType } : {}),
        ...(info.correlation ? { correlation: info.correlation } : {}),
      };
      if (entry.messageType || entry.correlation) events.push(entry);
    }

    const diagram: Diagram = {
      name: humanize(this.className),
      saga,
      ...(events.length ? { events } : {}),
      direction: 'top-bottom',
      nodes,
      edges,
    };
    return { className: this.className, diagram, locations };
  }

  // ---- joins

  /**
   * The transitions as the diagram draws them. A handler of an event a `CompositeEvent` waits for
   * that stays in its state counts towards the join: it becomes a transition into the join. The
   * handler of the composite event itself leaves the join (once, however many states have it).
   */
  private resolveJoins(): Transition[] {
    const flow: Transition[] = [];
    const left = new Set<string>();
    for (const t of this.transitions) {
      const composite = this.composites.get(t.event);
      if (composite) {
        const key = `${t.event}|${t.target}|${t.guard ?? ''}`;
        if (left.has(key)) continue;
        left.add(key);
        if (t.target === undefined) {
          this.warn(t.at, `${t.event} is a join and leads nowhere: not drawn.`);
          continue;
        }
        flow.push({ ...t, source: `${JOIN}${t.event}` });
        continue;
      }
      const joins = [...this.composites].filter(([, c]) => c.events.includes(t.event));
      if (joins.length === 0) {
        flow.push(t);
      } else if (t.target === undefined && t.source !== '*') {
        for (const [name] of joins) flow.push({ ...t, target: `${JOIN}${name}` });
      } else {
        flow.push(t);
        for (const [name] of joins) {
          this.warn(
            t.at,
            `${t.event} counts towards the join ${name} but moves the saga on: drawn as an ordinary transition, not into the join.`,
          );
        }
      }
    }
    return flow;
  }

  /** The joins that have a transition into or out of them, in the order of the declarations. */
  private joinsIn(flow: readonly Transition[]): string[] {
    const used = new Set(
      flow.flatMap((t) => [t.source, t.target ?? '']).filter((n) => n.startsWith(JOIN)),
    );
    const joins: string[] = [];
    for (const [name, composite] of this.composites) {
      if (used.has(`${JOIN}${name}`)) joins.push(name);
      else this.warn(composite.at, `The join ${name} is not used by any transition: not drawn.`);
    }
    return joins;
  }

  // ---- warnings

  private warn(at: SourceLocation, message: string): void {
    this.warnings.push({ path: at.path, line: at.line, message: `${this.className}: ${message}` });
  }

  /** Said once per kind of call, at its first place: `Then` is everywhere in a saga. */
  private warnOnce(at: SourceLocation, message: string): void {
    if (this.said.has(message)) return;
    this.said.add(message);
    this.warn(at, message);
  }
}

// ---- small helpers

/** The message created in the arguments of a Send/Publish: `new T(…)`, `Init<T>(…)`. */
function messageTypeIn(args: readonly SyntaxNode[]): string | undefined {
  for (const arg of args) {
    for (const node of [arg, ...descendants(arg)]) {
      if (
        node.type === 'object_creation_expression' ||
        node.type === 'implicit_object_creation_expression'
      ) {
        const type = lastName(node.childForFieldName('type'));
        if (type && type !== 'Uri') return type;
      }
      const call = callOf(node);
      if (call?.name === 'Init' && call.typeArgs[0]) return call.typeArgs[0];
    }
  }
  return undefined;
}

const short = (text: string) =>
  (text.length > 60 ? `${text.slice(0, 57)}…` : text).replace(/\s+/g, ' ');

const slug = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

function uniqueId(base: string, nodes: readonly { id: string }[]): string {
  if (!nodes.some((n) => n.id === base)) return base;
  return nextId(base, nodes);
}

/** `OrderStateMachine` → `Order`, `TicketStateMachine` → `Ticket`; other names stay. */
function humanize(className: string): string {
  const base = className.replace(/(State)?Machine$/, '').replace(/Saga$/, '') || className;
  return base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function dedupe<T extends Activity | string>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = typeof item === 'string' ? item : `${item.kind}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
