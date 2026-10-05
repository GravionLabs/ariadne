import {
  Activity,
  Diagram,
  DiagramEdge,
  DiagramNode,
  DEFAULT_CORRELATION,
  RoutingSlip,
  SLIP_OUTCOMES,
} from '@ariadne/core';

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

/**
 * `Order saga` → `Order`: the name without a closing "state machine" or "saga" and the space before it.
 * (`/\s*(state ?machine|saga)\s*$/i` does the same but backtracks quadratically on a long run of spaces.)
 */
function withoutSagaSuffix(name: string): string {
  const end = name.trimEnd();
  const found = /(state ?machine|saga)$/i.exec(end);
  return found ? end.slice(0, found.index).trimEnd() : name;
}

const indent = (n: number): string => '    '.repeat(n);
const TIMEOUT_UNITS: Record<string, string> = {
  ms: 'Milliseconds',
  s: 'Seconds',
  m: 'Minutes',
  h: 'Hours',
  d: 'Days',
};

/** The lines setting the delay of a timeout: a duration, a TODO for other text, a reminder for none. */
function scheduleDelay(delay: string | undefined): string[] {
  if (!delay) return ['// TODO: set s.Delay, how long the timeout waits'];
  const found = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(delay.trim());
  if (found) return [`s.Delay = TimeSpan.From${TIMEOUT_UNITS[found[2]]}(${found[1]});`];
  return [`s.Delay = TimeSpan.FromMinutes(1); /* TODO delay: ${comment(delay)} */`];
}

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
  const base = identifier(withoutSagaSuffix(diagram.name ?? ''), 'Saga');
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
  // The timeouts the states schedule or cancel, each once; the delay is the first one given.
  const timerList: { name: string; scheduled: boolean; delay?: string }[] = [];
  for (const n of states) {
    for (const t of n.timers ?? []) {
      let known = timerList.find((k) => k.name === t.name);
      if (!known) timerList.push((known = { name: t.name, scheduled: false }));
      if (t.action === 'schedule') {
        known.scheduled = true;
        if (t.delay && !known.delay) known.delay = t.delay;
      }
    }
  }
  const isTimeout = (event: string): boolean =>
    timerList.some((t) => t.scheduled && t.name === event);
  // The routing slips the states start (ADR 0023), each once; the first itinerary given is used.
  const slipList: RoutingSlip[] = [];
  for (const n of states) {
    for (const s of n.routingSlips ?? []) {
      if (!slipList.some((k) => k.name === s.name)) slipList.push(s);
    }
  }
  /** `Fulfil.Completed` → the slip and its outcome, when a state starts a slip of that name. */
  const slipOutcomeOf = (event: string): { slip: string; outcome: string } | undefined => {
    const found = /^(.+)\.(Completed|Faulted)$/.exec(event);
    return found && slipList.some((s) => s.name === found[1])
      ? { slip: found[1], outcome: found[2] }
      : undefined;
  };
  const answerOf = (event: string): { request: string; outcome: string } | undefined => {
    const found = /^(.+)\.(Completed|Faulted|TimeoutExpired)$/.exec(event);
    return found && !slipOutcomeOf(event) ? { request: found[1], outcome: found[2] } : undefined;
  };
  // C# has one RoutingSlipCompleted and one RoutingSlipFaulted: a state can wait for the outcome of
  // one slip only, since its state is what tells the slips apart.
  const slipsAwaited = (source: string): Set<string> =>
    new Set(
      diagram.edges
        .filter((e) => e.source === source && e.event && slipOutcomeOf(e.event))
        .map((e) => slipOutcomeOf(e.event!)!.slip),
    );

  // A join (CompositeEvent) waits for the events of the transitions into it. Those transitions are
  // written as handlers that stay in their state; the transition leaving the join is written in
  // each of those states, on the composite event.
  const joinSources = new Map<string, string[]>();
  const validIntoJoin = (edge: DiagramEdge): boolean =>
    !!edge.event &&
    nodes.get(edge.target)?.type === 'join' &&
    nodes.has(edge.source) &&
    nodes.get(edge.source)!.type !== 'join' &&
    (!answerOf(edge.event) || requestList.some((r) => r.name === answerOf(edge.event!)!.request));
  for (const edge of diagram.edges.filter(validIntoJoin)) {
    const sources = joinSources.get(edge.target) ?? [];
    if (!sources.includes(edge.source)) sources.push(edge.source);
    joinSources.set(edge.target, sources);
  }
  for (const join of diagram.nodes.filter((n) => n.type === 'join')) {
    if (!joinSources.has(join.id))
      warnings.push(`The join "${join.name}" waits for no event: not generated.`);
  }

  // Transitions we can write: they need an event, and must not wait for a timer's answer that no
  // state schedules or a request no state makes.
  const usable: DiagramEdge[] = [];
  for (const edge of diagram.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (source.type === 'join' && target.type === 'join') {
      warnings.push(`The join "${source.name}" leads into another join: not generated.`);
    } else if (source.type === 'join') {
      for (const from of joinSources.get(source.id) ?? []) {
        usable.push({ ...edge, id: `${edge.id}@${from}`, source: from, event: source.name });
      }
    } else if (!edge.event) {
      warnings.push(`The transition ${source.name} → ${target.name} has no event: not generated.`);
    } else if (
      answerOf(edge.event) &&
      !requestList.some((r) => r.name === answerOf(edge.event!)!.request)
    ) {
      warnings.push(`${edge.event} is the answer of a request no state makes: not generated.`);
    } else if (slipOutcomeOf(edge.event) && slipsAwaited(source.id).size > 1) {
      warnings.push(
        `${source.name} waits for the outcomes of several routing slips, which C# cannot tell apart: ${edge.event} is not generated.`,
      );
    } else if (target.type !== 'join' || joinSources.has(target.id)) {
      usable.push(edge);
    }
  }
  const joinList = diagram.nodes.filter((n) => n.type === 'join' && joinSources.has(n.id));
  const joinEvents = (join: DiagramNode): string[] => [
    ...new Set(
      usable.filter((e) => e.target === join.id && !e.id.includes('@')).map((e) => e.event!),
    ),
  ];

  // C# has no marker for a compensation: it is written as what it is, an ordinary transition or none.
  for (const edge of usable) {
    if (edge.kind === 'compensation') {
      warnings.push(
        `The compensation ${nodes.get(edge.source)!.name} → ${nodes.get(edge.target)!.name} (${edge.event}) is written as an ordinary transition: C# does not mark it.`,
      );
    }
  }
  for (const n of states) {
    if (n.compensation) {
      warnings.push(
        `The compensation ${n.compensation.name} of state ${n.name} is not generated: write the undo action yourself.`,
      );
    }
  }

  const stateName = new Map<string, string>();
  for (const n of states) stateName.set(n.id, names.of(n.id, 'State', n.name, 'State'));

  const eventNames: string[] = [];
  for (const e of [...usable.map((x) => x.event!), ...states.flatMap((s) => s.ignores ?? [])]) {
    if (
      !eventNames.includes(e) &&
      !answerOf(e) &&
      !slipOutcomeOf(e) &&
      !isTimeout(e) &&
      !joinList.some((n) => n.name === e)
    )
      eventNames.push(e);
  }
  const eventProperty = new Map(eventNames.map((e) => [e, names.of(e, 'Event', e, 'Event')]));
  const requestProperty = new Map(
    requestList.map((r) => [r.name, names.of(r.name, 'Request', r.name, 'Request')]),
  );
  const timerProperty = new Map(
    timerList.map((t) => [t.name, names.of(t.name, 'Timeout', t.name, 'Timeout')]),
  );
  const joinProperty = new Map(
    joinList.map((n) => [n.name, names.of(`join:${n.id}`, 'Event', n.name, 'Event')]),
  );
  const slipOutcomes = SLIP_OUTCOMES.filter((o) =>
    [...usable.map((x) => x.event!), ...states.flatMap((s) => s.ignores ?? [])].some(
      (e) => slipOutcomeOf(e)?.outcome === o,
    ),
  );
  const slipProperty = new Map<string, string>(
    slipOutcomes.map((o) => [o, names.of(`slip:${o}`, 'Event', `RoutingSlip${o}`, 'Event')]),
  );
  const eventRef = (event: string): string => {
    if (joinProperty.has(event)) return joinProperty.get(event)!;
    const slip = slipOutcomeOf(event);
    if (slip) return slipProperty.get(slip.outcome)!;
    if (isTimeout(event)) return `${timerProperty.get(event)}.Received`;
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

  // Courier knows an activity by the queue it executes on; a compensating one also has a queue to
  // compensate on, but that is a property of its type, so the itinerary only says it in a comment.
  const queueOf = (name: string): string =>
    identifier(name, 'Activity')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
  const slipCode = (slip: RoutingSlip): string =>
    [
      '.ThenAsync(async context =>',
      `${indent(3)}{`,
      `${indent(4)}// Routing slip: ${identifier(slip.name, 'RoutingSlip')}`,
      `${indent(4)}var builder = new RoutingSlipBuilder(context.Saga.CorrelationId);`,
      ...slip.activities.map(
        (a) =>
          `${indent(4)}builder.AddActivity("${identifier(a.name, 'Activity')}", new Uri("queue:${queueOf(a.name)}_execute"));${a.compensates ? ' // compensates' : ''}`,
      ),
      `${indent(4)}builder.AddSubscription(context.ReceiveContext.InputAddress, RoutingSlipEvents.Completed | RoutingSlipEvents.Faulted);`,
      `${indent(4)}await context.Execute(builder.Build());`,
      `${indent(3)}})`,
    ].join('\n');

  const timerMessage = (name: string): string => `${timerProperty.get(name)}Message`;
  const timerCode = (t: { action: string; name: string }): string =>
    t.action === 'schedule'
      ? `.Schedule(${timerProperty.get(t.name)}, context => new ${timerMessage(t.name)} { CorrelationId = context.Saga.CorrelationId /* TODO: set the other properties */ })`
      : `.Unschedule(${timerProperty.get(t.name)})`;
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
  for (const o of slipOutcomes) {
    body.push(
      `${ctor}Event(() => ${slipProperty.get(o)}, x => x.CorrelateById(context => context.Message.TrackingNumber));`,
    );
  }
  if (eventNames.length || slipOutcomes.length) body.push('');
  for (const r of requestList) {
    const property = requestProperty.get(r.name)!;
    body.push(
      `${ctor}Request(() => ${property}, x => x.${property}RequestId${requestTimeout(r.timeout)});`,
    );
  }
  if (requestList.length) body.push('');
  for (const t of timerList) {
    const property = timerProperty.get(t.name)!;
    body.push(
      `${ctor}Schedule(() => ${property}, x => x.${property}TokenId, s =>`,
      `${ctor}{`,
      ...scheduleDelay(t.delay).map((line) => `${indent(3)}${line}`),
      `${indent(3)}s.Received = e => e.CorrelateById(context => context.Message.CorrelationId);`,
      `${ctor}});`,
    );
  }
  if (timerList.length) body.push('');
  for (const join of joinList) {
    const property = joinProperty.get(join.name)!;
    body.push(
      `${ctor}CompositeEvent(() => ${property}, x => x.${property}Status, ${joinEvents(join).map(eventRef).join(', ')});`,
    );
  }
  if (joinList.length) body.push('');

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
      ...ignores.map((e) => `${indent(3)}Ignore(${eventRef(e)})`),
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
      ...(state.timers ?? []).map(timerCode),
      ...(state.activities ?? []).map(activityCode),
      ...(state.routingSlips ?? []).filter((s) => s.activities.length).map(slipCode),
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

  const memberGroups = [
    states.map(
      (s) => `${indent(1)}public State ${stateName.get(s.id)} { get; private set; } = null!;`,
    ),
    eventNames.map(
      (e) =>
        `${indent(1)}public Event<${messageType(e)}> ${eventProperty.get(e)} { get; private set; } = null!;`,
    ),
    slipOutcomes.map(
      (o) =>
        `${indent(1)}public Event<RoutingSlip${o}> ${slipProperty.get(o)} { get; private set; } = null!;`,
    ),
    joinList.map(
      (n) => `${indent(1)}public Event ${joinProperty.get(n.name)} { get; private set; } = null!;`,
    ),
    requestList.map(
      (r) =>
        `${indent(1)}public Request<${instanceType}, ${requestMessage(r.name)}, ${requestResponse(r.name)}> ${requestProperty.get(r.name)} { get; private set; } = null!;`,
    ),
    timerList.map(
      (t) =>
        `${indent(1)}public Schedule<${instanceType}, ${timerMessage(t.name)}> ${timerProperty.get(t.name)} { get; private set; } = null!;`,
    ),
  ].filter((group) => group.length);
  const members = memberGroups.flatMap((group, i) => (i ? ['', ...group] : group));

  const usings = ['using System;', 'using MassTransit;'];
  if (slipOutcomes.length || states.some((s) => s.routingSlips?.length))
    usings.push('using MassTransit.Courier.Contracts;');
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
      ...timerList.map(
        (t) => `${indent(1)}public Guid? ${timerProperty.get(t.name)}TokenId { get; set; }`,
      ),
      ...joinList.map(
        (n) => `${indent(1)}public int ${joinProperty.get(n.name)}Status { get; set; }`,
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
    ...timerList.filter((t) => t.scheduled).map((t) => timerMessage(t.name)),
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
