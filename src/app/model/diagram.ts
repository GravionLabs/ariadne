export interface Point {
  x: number;
  y: number;
}

/**
 * Nodes are the states of a saga state machine: the initial state (`start`), the final state
 * (`end`) and the states in between. A state that several transitions leave is a decision. The
 * `any` node is not a state the saga is in: its transitions apply in every state (`DuringAny`).
 * A `join` is not one either: it waits until the events of all its incoming transitions have
 * arrived (`CompositeEvent`).
 */
export type NodeType = 'start' | 'end' | 'state' | 'any' | 'join';
export type EdgeKind = 'forward' | 'compensation';
export type Direction = 'top-bottom' | 'left-right';

/**
 * A message in the MassTransit sense: a command is an imperative instruction sent to exactly
 * one consumer (`SubmitOrder`); an event is a past-tense fact published to any number of
 * subscribers (`OrderSubmitted`).
 */
export type MessageKind = 'command' | 'event';
export const MESSAGE_KINDS: readonly MessageKind[] = ['command', 'event'];

/**
 * Something a state does when the saga enters it: send a command or publish an event
 * (MassTransit's `WhenEnter(State, binder => binder.Send(...).Publish(...))`).
 */
export interface Activity {
  kind: MessageKind;
  name: string;
}

/**
 * A timeout a state schedules when the saga enters it, or cancels (MassTransit's `Schedule`).
 * When a scheduled timeout fires, the saga receives its `name` as an event: a transition whose
 * `event` is that name is the timeout path.
 */
export interface Timer {
  action: 'schedule' | 'unschedule';
  /** The timeout message, e.g. `PaymentTimeout`. */
  name: string;
  /** How long until it fires, free text such as `30s`. Only with `schedule`. */
  delay?: string;
}

/**
 * A request a state makes when the saga enters it (MassTransit's `Request`). The reply comes
 * back as one of three events: `<name>.Completed`, `<name>.Faulted` or `<name>.TimeoutExpired`;
 * transitions on those events are the paths out of the request.
 */
export interface Request {
  /** The request, e.g. `ValidateAddress`. */
  name: string;
  /** How long to wait for the reply, free text such as `30s`. */
  timeout?: string;
}

/** How a request ends: the reply, a fault, or no answer in time. */
export const REQUEST_OUTCOMES = ['Completed', 'Faulted', 'TimeoutExpired'] as const;
export type RequestOutcome = (typeof REQUEST_OUTCOMES)[number];

/** The event raised when request `name` ends as `outcome`, e.g. `ValidateAddress.Completed`. */
export const requestEvent = (name: string, outcome: RequestOutcome): string => `${name}.${outcome}`;

/** Undo action that runs when a later part of the saga fails. Only states can have one. */
export interface Compensation {
  name: string;
  description?: string;
}

/** Accent colors a node can be given; the hex values live in styles.scss (`--c-node-<name>`). */
export const NODE_COLORS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;
/** A palette name or a custom `#rrggbb` color. */
export type NodeColor = (typeof NODE_COLORS)[number] | `#${string}`;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const isNodeColor = (v: unknown): v is NodeColor =>
  typeof v === 'string' && ((NODE_COLORS as readonly string[]).includes(v) || HEX_COLOR.test(v));

export interface DiagramNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  /** Accent color shown at the top of the card; absent = the default of the node's type. */
  color?: NodeColor;
  /**
   * What the saga does on entering this state, in order. Only states have them: the initial state
   * is not entered through a transition, and nothing happens in a final state, it ends the saga.
   */
  activities?: Activity[];
  compensation?: Compensation;
  /** Requests the state makes on entry, in order. Only on states. */
  requests?: Request[];
  /** Timeouts the state schedules or cancels on entry, in order. Only on states. */
  timers?: Timer[];
  /** Events the state ignores instead of failing on them (`Ignore(E)`). Only on states. */
  ignores?: string[];
  /** Free-text notes, e.g. "3 attempts, exponential backoff" / "30s". Documentation only. */
  retry?: string;
  timeout?: string;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /** Event that triggers the transition while the source state is active, e.g. `PaymentCharged`. */
  event?: string;
  /**
   * Where the event comes from when the saga does not publish it itself, e.g. `Shop API`. Events
   * can arrive from outside in any state, not only the initial one.
   */
  eventSource?: string;
  /**
   * Condition under which the transition is taken, free text such as `amount > 100`
   * (MassTransit's `If` / `IfElse`). Only with an `event`; several transitions on the same event
   * with different guards are the branches.
   */
  guard?: string;
}

/** The event of a transition as shown on it: `PaymentCharged [amount > 100]`. */
export const eventLabel = (edge: Pick<DiagramEdge, 'event' | 'guard'>): string =>
  edge.event ? `${edge.event}${edge.guard ? ` [${edge.guard}]` : ''}` : '';

/** Node positions are not stored: the editor lays the graph out in `direction`. */
export interface Diagram {
  /** Title of the saga, e.g. `Order Saga`. Absent: exports use the file name. */
  name?: string;
  /** A sentence or two about what the saga does; shown under the title in exports. */
  description?: string;
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

/** Only plain states can have {@link Activity activities}; the initial and final states cannot. */
export const hasActivities = (type: NodeType): boolean => type === 'state';

/** Only plain states can make {@link DiagramNode.requests requests}. */
export const hasRequests = (type: NodeType): boolean => type === 'state';

/** Only plain states can schedule {@link DiagramNode.timers timeouts}. */
export const hasTimers = (type: NodeType): boolean => type === 'state';

/** Only plain states can list {@link DiagramNode.ignores ignored events}. */
export const hasIgnores = (type: NodeType): boolean => type === 'state';

/**
 * Names of the events the saga publishes itself (an activity of some state). Every other event a
 * transition reacts to comes from outside.
 */
export function publishedEvents(diagram: Diagram): Set<string> {
  return new Set(
    diagram.nodes.flatMap((n) =>
      (n.activities ?? []).filter((a) => a.kind === 'event').map((a) => a.name),
    ),
  );
}

/** The initial state has no incoming transitions, the final state no outgoing ones. */
export const hasInput = (type: NodeType): boolean => type !== 'start' && type !== 'any';
export const hasOutput = (type: NodeType): boolean => type !== 'end';

export const DEFAULT_NAMES: Record<NodeType, string> = {
  start: 'Initial',
  end: 'Final',
  state: 'State',
  any: 'Any state',
  join: 'Join',
};

/** A new diagram: the initial state to build from. */
export const emptyDiagram = (): Diagram => ({
  direction: 'top-bottom',
  nodes: [{ id: 'start-1', type: 'start', name: DEFAULT_NAMES.start }],
  edges: [],
});

/** f-flow connector ids: every node has one input and one output connector. */
export const inputId = (nodeId: string): string => `${nodeId}:in`;
export const outputId = (nodeId: string): string => `${nodeId}:out`;

/** Inverse of {@link inputId} / {@link outputId}; returns the node id. */
export const nodeIdOfConnector = (id: string): string => id.slice(0, id.lastIndexOf(':'));

/** Next free id of the form `<prefix>-<n>` (stable, human-readable, git-friendly). */
export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existing.reduce((acc, { id }) => {
    const match = pattern.exec(id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${max + 1}`;
}

/**
 * What kind of event a transition reacts to. `timeout` is a scheduled timeout firing or a request
 * running out of time; `reply` and `fault` are the two answers to a request; `internal` is
 * the composite event of a `join`; `internal` is published by a state of the saga; everything else
 * comes from `external`. Derived, never stored.
 */
export type EventKind = 'internal' | 'external' | 'timeout' | 'reply' | 'fault' | 'composite';

/** Classifies events of `diagram`; `undefined` for a transition without an event. */
export function eventKindOf(
  diagram: Diagram,
): (edge: Pick<DiagramEdge, 'event'>) => EventKind | undefined {
  const published = publishedEvents(diagram);
  const timeouts = new Set(
    diagram.nodes.flatMap((n) =>
      (n.timers ?? []).filter((t) => t.action === 'schedule').map((t) => t.name),
    ),
  );
  const outcomes = new Map<string, EventKind>(
    diagram.nodes.flatMap((n) =>
      (n.requests ?? []).flatMap((r): [string, EventKind][] => [
        [requestEvent(r.name, 'Completed'), 'reply'],
        [requestEvent(r.name, 'Faulted'), 'fault'],
        [requestEvent(r.name, 'TimeoutExpired'), 'timeout'],
      ]),
    ),
  );
  const composites = new Set(diagram.nodes.filter((n) => n.type === 'join').map((n) => n.name));
  return ({ event }) => {
    if (!event) return undefined;
    if (composites.has(event)) return 'composite';
    if (timeouts.has(event)) return 'timeout';
    const outcome = outcomes.get(event);
    if (outcome) return outcome;
    return published.has(event) ? 'internal' : 'external';
  };
}

/**
 * The events each join waits for: those of the transitions leading into it, each once, in
 * transition order. Derived: a transition is triggered by its event, so these are the events.
 */
export function joinEventsOf(diagram: Diagram): Map<string, string[]> {
  const joins = new Map(
    diagram.nodes.filter((n) => n.type === 'join').map((n): [string, string[]] => [n.id, []]),
  );
  for (const { target, event } of diagram.edges) {
    const events = joins.get(target);
    if (events && event && !events.includes(event)) events.push(event);
  }
  return joins;
}
