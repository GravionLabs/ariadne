export interface Point {
  x: number;
  y: number;
}

/**
 * Nodes are the states of a saga state machine: the initial state (`start`), the final state
 * (`end`) and the states in between. A state that several transitions leave is a decision.
 */
export type NodeType = 'start' | 'end' | 'state';
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
}

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
export const hasInput = (type: NodeType): boolean => type !== 'start';
export const hasOutput = (type: NodeType): boolean => type !== 'end';

export const DEFAULT_NAMES: Record<NodeType, string> = {
  start: 'Initial',
  end: 'Final',
  state: 'State',
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
