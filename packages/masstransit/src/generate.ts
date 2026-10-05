import { Activity, Diagram, DiagramEdge, DiagramNode, DEFAULT_CORRELATION } from '@ariadne/core';

/** A generated source file; `path` is relative, to be written next to the others. */
export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateResult {
  /** The state machine, the saga instance and the message contracts. */
  files: GeneratedFile[];
  /** What could not be generated, or had to be renamed; one sentence each. */
  warnings: string[];
}

/** Members the state machine base class already has; a state or event must not take their name. */
const RESERVED = ['Initial', 'Final', 'Name', 'Accessor', 'Behavior'];

/**
 * A C# identifier from free text: words are joined in PascalCase (`charging payment` →
 * `ChargingPayment`), a word keeps its own capitals (`OrderSubmitted` stays), nothing usable gives
 * `fallback`. Capitalised, a word is never a C# keyword.
 */
export function identifier(text: string, fallback = 'Item'): string {
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let id = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!id) id = fallback;
  if (/^\p{N}/u.test(id)) id = `_${id}`;
  return id;
}

/** Hands out identifiers that are unique within one scope and reports the names it had to change. */
class Names {
  private readonly taken = new Set<string>();
  private readonly byKey = new Map<string, string>();

  constructor(
    reserved: readonly string[],
    private readonly warnings: string[],
  ) {
    reserved.forEach((r) => this.taken.add(r));
  }

  /** The identifier for `key` (stable for the same key); `what` names the thing in warnings. */
  of(key: string, what: string, text = key, fallback?: string): string {
    const known = this.byKey.get(`${what}:${key}`);
    if (known) return known;
    const base = identifier(text, fallback);
    let id = base;
    for (let n = 2; this.taken.has(id); n++) id = `${base}${n}`;
    if (id !== base) {
      this.warnings.push(`${what} "${text}" is called ${id} in code: ${base} is taken.`);
    }
    this.taken.add(id);
    this.byKey.set(`${what}:${key}`, id);
    return id;
  }
}

const indent = (n: number): string => '    '.repeat(n);
const TIMEOUT_UNITS: Record<string, string> = {
  ms: 'Milliseconds',
  s: 'Seconds',
  m: 'Minutes',
  h: 'Hours',
  d: 'Days',
};

/** `, r => r.Timeout = TimeSpan.FromSeconds(30)` for `30s`; a text that is no duration stays a TODO. */
function requestTimeout(timeout: string | undefined): string {
  if (!timeout) return '';
  const found = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(timeout.trim());
  if (found) return `, r => r.Timeout = TimeSpan.From${TIMEOUT_UNITS[found[2]]}(${found[1]})`;
  return `, r => r.Timeout = TimeSpan.FromSeconds(30) /* TODO timeout: ${comment(timeout)} */`;
}

const comment = (text: string): string => text.replace(/\*\//g, '* /').replace(/\s+/g, ' ').trim();

/**
 * C# for a saga state machine from a diagram: the state machine, the saga instance and the message
 * contracts. The same diagram always gives the same files. Properties of the messages are left as
 * `TODO` for the developer, as is every guard; what the diagram cannot say is reported in
 * `warnings` instead of being guessed.
 */
export function generateSaga(diagram: Diagram): GenerateResult {
  const warnings: string[] = [];
  const info = diagram.saga ?? {};
  const base = identifier(
    (diagram.name ?? '').replace(/\s*(state ?machine|saga)\s*$/i, ''),
    'Saga',
  );
  const className = info.className ?? `${base}StateMachine`;
  const instanceType = info.instanceType ?? `${base}State`;
  const stateProperty = info.stateProperty ?? 'CurrentState';
  const namespace = info.namespace;
  const contractsNamespace = info.contractsNamespace ?? namespace;

  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const eventInfo = new Map((diagram.events ?? []).map((e) => [e.name, e]));
  const names = new Names([...RESERVED, className, instanceType], warnings);

  const states = diagram.nodes.filter((n) => n.type === 'state');
  // The requests the states make, each once, and how long it waits (the first state that says).
  const requestList: { name: string; timeout?: string }[] = [];
  for (const n of states) {
    for (const r of n.requests ?? []) {
      const known = requestList.find((k) => k.name === r.name);
      if (!known) requestList.push({ ...r });
      else if (r.timeout && known.timeout && r.timeout !== known.timeout) {
        warnings.push(
          `Request ${r.name} has two timeouts (${known.timeout}, ${r.timeout}): the first is used.`,
        );
      } else if (r.timeout && !known.timeout) known.timeout = r.timeout;
    }
  }
  const answerOf = (event: string): { request: string; outcome: string } | undefined => {
    const found = /^(.+)\.(Completed|Faulted|TimeoutExpired)$/.exec(event);
    return found ? { request: found[1], outcome: found[2] } : undefined;
  };

  // Transitions we can write: they need an event, and must not touch a join (CompositeEvent) or
  // wait for a timer, which are not generated yet.
  const usable: DiagramEdge[] = [];
  for (const edge of diagram.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (source.type === 'join' || target.type === 'join') {
      warnings.push(
        `A join ("${(source.type === 'join' ? source : target).name}") is not generated yet.`,
      );
    } else if (!edge.event) {
      warnings.push(`The transition ${source.name} → ${target.name} has no event: not generated.`);
    } else if (
      answerOf(edge.event) &&
      !requestList.some((r) => r.name === answerOf(edge.event!)!.request)
    ) {
      warnings.push(`${edge.event} is the answer of a request no state makes: not generated.`);
    } else {
      usable.push(edge);
    }
  }
  for (const n of states) {
    if (n.timers?.length) warnings.push(`The timeouts of state ${n.name} are not generated yet.`);
  }

  const stateName = new Map<string, string>();
  for (const n of states) stateName.set(n.id, names.of(n.id, 'State', n.name, 'State'));

  const eventNames: string[] = [];
  for (const e of [...usable.map((x) => x.event!), ...states.flatMap((s) => s.ignores ?? [])]) {
    if (!eventNames.includes(e) && !answerOf(e)) eventNames.push(e);
  }
  const eventProperty = new Map(eventNames.map((e) => [e, names.of(e, 'Event', e, 'Event')]));
  const requestProperty = new Map(
    requestList.map((r) => [r.name, names.of(r.name, 'Request', r.name, 'Request')]),
  );
  const eventRef = (event: string): string => {
    const answer = answerOf(event);
    return answer && requestProperty.has(answer.request)
      ? `${requestProperty.get(answer.request)}.${answer.outcome}`
      : eventProperty.get(event)!;
  };
  const messageType = (event: string): string =>
    identifier(eventInfo.get(event)?.messageType ?? event, 'Message');

  const externalFrom = new Map<string, string[]>();
  for (const e of usable) {
    if (!e.eventSource) continue;
    const list = externalFrom.get(e.event!) ?? [];
    if (!list.includes(e.eventSource)) list.push(e.eventSource);
    externalFrom.set(e.event!, list);
  }

  const messageOf = (a: Activity): string => identifier(a.name, 'Message');
  const activityCode = (a: Activity): string =>
    `.${a.kind === 'command' ? 'Send' : 'Publish'}(context => new ${messageOf(a)} { CorrelationId = context.Saga.CorrelationId /* TODO: set the other properties */ })`;

  const requestMessage = (name: string): string => `${requestProperty.get(name)}Request`;
  const requestResponse = (name: string): string => `${requestProperty.get(name)}Response`;
  const requestCode = (name: string): string =>
    `.Request(${requestProperty.get(name)}, context => new ${requestMessage(name)} { CorrelationId = context.Saga.CorrelationId /* TODO: set the other properties */ })`;

  // ---- the state machine
  const body: string[] = [];
  const ctor = indent(2);
  body.push(`${ctor}InstanceState(x => x.${stateProperty});`, '');
  for (const e of eventNames) {
    const from = externalFrom.get(e);
    const correlation = eventInfo.get(e)?.correlation;
    const at = from ? ` // from ${comment(from.join(', '))}` : '';
    if (correlation && correlation !== DEFAULT_CORRELATION) {
      const call = /^CorrelateBy/.test(correlation) ? correlation : `CorrelateBy(${correlation})`;
      body.push(`${ctor}Event(() => ${eventProperty.get(e)}, x => x.${call});${at}`);
    } else {
      body.push(`${ctor}Event(() => ${eventProperty.get(e)});${at}`);
    }
  }
  if (eventNames.length) body.push('');
  for (const r of requestList) {
    const property = requestProperty.get(r.name)!;
    body.push(
      `${ctor}Request(() => ${property}, x => x.${property}RequestId${requestTimeout(r.timeout)});`,
    );
  }
  if (requestList.length) body.push('');

  const endOf = (edge: DiagramEdge): string => {
    const target = nodes.get(edge.target)!;
    return target.type === 'end'
      ? '.Finalize()'
      : target.type === 'state'
        ? `.TransitionTo(${stateName.get(target.id)})`
        : '';
  };
  const todoGuard = (guard: string): string => `true /* TODO guard: ${comment(guard)} */`;
  const transition = (edge: DiagramEdge, depth: number): string => {
    const when = edge.guard
      ? `When(${eventRef(edge.event!)}, context => ${todoGuard(edge.guard)})`
      : `When(${eventRef(edge.event!)})`;
    const end = endOf(edge);
    return `${indent(depth)}${when}${end ? `\n${indent(depth + 1)}${end}` : ''}`;
  };
  /** Two edges on one event, the first guarded and the second its opposite: one `IfElse`. */
  const ifElse = (first: DiagramEdge, second: DiagramEdge, depth: number): string =>
    [
      `${indent(depth)}When(${eventRef(first.event!)})`,
      `${indent(depth + 1)}.IfElse(context => ${todoGuard(first.guard!)},`,
      `${indent(depth + 2)}then => then${endOf(first)},`,
      `${indent(depth + 2)}otherwise => otherwise${endOf(second)})`,
    ].join('\n');
  const transitions = (edges: DiagramEdge[], depth: number): string[] => {
    const items: string[] = [];
    const done = new Set<DiagramEdge>();
    for (const edge of edges) {
      if (done.has(edge)) continue;
      const same = edges.filter((o) => o.event === edge.event);
      const [, second] = same;
      if (
        same.length === 2 &&
        edge.guard &&
        (!second.guard || second.guard === `!(${edge.guard})`)
      ) {
        same.forEach((o) => done.add(o));
        items.push(ifElse(edge, second, depth));
      } else {
        items.push(transition(edge, depth));
      }
    }
    return items;
  };
  const block = (head: string, edges: DiagramEdge[]): void => {
    if (!edges.length) return;
    const items = transitions(edges, 3);
    body.push(`${ctor}${head}(`);
    items.forEach((item, i) => {
      body.push(item.replace(/$/, i === items.length - 1 ? ');' : ','));
    });
    body.push('');
  };
  const edgesFrom = (node: DiagramNode): DiagramEdge[] =>
    usable.filter((e) => e.source === node.id && nodes.get(e.target)!.type !== 'start');

  for (const start of diagram.nodes.filter((n) => n.type === 'start')) {
    block('Initially', edgesFrom(start));
  }
  for (const state of states) {
    const edges = edgesFrom(state);
    const ignores = state.ignores ?? [];
    if (!edges.length && !ignores.length) continue;
    const head = `During(${stateName.get(state.id)}`;
    const items = [
      ...transitions(edges, 3),
      ...ignores.map((e) => `${indent(3)}Ignore(${eventProperty.get(e)})`),
    ];
    body.push(`${ctor}${head},`);
    items.forEach((item, i) => body.push(item + (i === items.length - 1 ? ');' : ',')));
    body.push('');
  }
  for (const any of diagram.nodes.filter((n) => n.type === 'any')) {
    block('DuringAny', edgesFrom(any));
  }
  for (const state of states) {
    const calls = [
      ...(state.requests ?? []).map((r) => requestCode(r.name)),
      ...(state.activities ?? []).map(activityCode),
    ];
    if (!calls.length) continue;
    body.push(`${ctor}WhenEnter(${stateName.get(state.id)}, binder => binder`);
    calls.forEach((c, i) => body.push(`${indent(3)}${c}${i === calls.length - 1 ? ');' : ''}`));
    body.push('');
  }
  if (
    diagram.nodes.some((n) => n.type === 'end') &&
    usable.some((e) => nodes.get(e.target)!.type === 'end')
  ) {
    body.push(`${ctor}SetCompletedWhenFinalized();`, '');
  }
  while (body.at(-1) === '') body.pop();

  const members = [
    ...states.map(
      (s) => `${indent(1)}public State ${stateName.get(s.id)} { get; private set; } = null!;`,
    ),
    ...(states.length && eventNames.length ? [''] : []),
    ...eventNames.map(
      (e) =>
        `${indent(1)}public Event<${messageType(e)}> ${eventProperty.get(e)} { get; private set; } = null!;`,
    ),
    ...(eventNames.length && requestList.length ? [''] : []),
    ...requestList.map(
      (r) =>
        `${indent(1)}public Request<${instanceType}, ${requestMessage(r.name)}, ${requestResponse(r.name)}> ${requestProperty.get(r.name)} { get; private set; } = null!;`,
    ),
  ];

  const usings = ['using System;', 'using MassTransit;'];
  if (contractsNamespace && contractsNamespace !== namespace)
    usings.push(`using ${contractsNamespace};`);
  const wrap = (ns: string | undefined, lines: string[]): string[] =>
    ns ? [`namespace ${ns};`, '', ...lines] : lines;
  const header = [
    '// Generated by Ariadne from a saga diagram. The TODOs are yours to fill in.',
    '',
  ];

  const machine = [
    ...header,
    ...usings,
    '',
    ...wrap(namespace, [
      `public class ${className} : MassTransitStateMachine<${instanceType}>`,
      '{',
      `${indent(1)}public ${className}()`,
      `${indent(1)}{`,
      ...body,
      `${indent(1)}}`,
      '',
      ...members,
      '}',
    ]),
  ];

  // The correlation expressions read properties of the messages and of the saga; they must exist.
  const messageProps = new Map<string, Set<string>>();
  const sagaProps = new Set<string>();
  for (const e of eventNames) {
    const text = eventInfo.get(e)?.correlation ?? '';
    const props = messageProps.get(messageType(e)) ?? new Set<string>();
    for (const m of text.matchAll(/\.Message\.(\w+)/g)) props.add(m[1]);
    messageProps.set(messageType(e), props);
    const saga = /\(\s*(\w+)\s*,\s*\w+\s*\)\s*=>/.exec(text)?.[1];
    if (saga)
      for (const m of text.matchAll(new RegExp(`\\b${saga}\\.(\\w+)`, 'g'))) sagaProps.add(m[1]);
  }
  const extra = (names: Iterable<string>, accessor: string): string[] =>
    [...names]
      .filter((n) => n !== 'CorrelationId' && n !== stateProperty)
      .map((n) => `${indent(1)}public Guid ${n} { get; ${accessor}; } // TODO: check the type`);

  const instance = [
    ...header,
    'using System;',
    'using MassTransit;',
    '',
    ...wrap(namespace, [
      `public class ${instanceType} : SagaStateMachineInstance`,
      '{',
      `${indent(1)}public Guid CorrelationId { get; set; }`,
      `${indent(1)}public string ${stateProperty} { get; set; } = null!;`,
      ...extra(sagaProps, 'set'),
      ...requestList.map(
        (r) => `${indent(1)}public Guid? ${requestProperty.get(r.name)}RequestId { get; set; }`,
      ),
      '}',
    ]),
  ];

  // ---- message contracts: what the saga consumes, sends and publishes, each once
  const contractNames: string[] = [];
  for (const m of [
    ...eventNames.map(messageType),
    ...states.flatMap((s) => (s.activities ?? []).map(messageOf)),
    ...requestList.flatMap((r) => [requestMessage(r.name), requestResponse(r.name)]),
  ]) {
    if (!contractNames.includes(m)) contractNames.push(m);
  }
  const contractLines: string[] = [];
  contractNames.forEach((c, i) => {
    if (i) contractLines.push('');
    contractLines.push(
      `public record ${c}`,
      '{',
      `${indent(1)}public Guid CorrelationId { get; init; }`,
      ...extra(messageProps.get(c) ?? [], 'init'),
      `${indent(1)}// TODO: add the properties of the message`,
      '}',
    );
  });
  const contracts = [...header, 'using System;', '', ...wrap(contractsNamespace, contractLines)];

  const files: GeneratedFile[] = [
    { path: `${className}.cs`, content: machine.join('\n') + '\n' },
    { path: `${instanceType}.cs`, content: instance.join('\n') + '\n' },
  ];
  if (contractNames.length)
    files.push({ path: 'Contracts.cs', content: contracts.join('\n') + '\n' });
  return { files, warnings: [...new Set(warnings)] };
}
