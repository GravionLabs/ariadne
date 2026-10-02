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

/** Something a transition does: send a command or publish an event. */
export interface Activity {
  kind: MessageKind;
  name: string;
}

/** Undo action that runs when a later part of the saga fails. Only states can have one. */
export interface Compensation {
  name: string;
  description?: string;
}

export interface DiagramNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
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
  /** What the transition does, in order, before entering the target state. */
  activities?: Activity[];
}

/** Node positions are not stored: the editor lays the graph out in `direction`. */
export interface Diagram {
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

/**
 * Names of the events the saga publishes itself (an activity of some transition). Every other
 * event a transition reacts to comes from outside.
 */
export function publishedEvents(diagram: Diagram): Set<string> {
  return new Set(
    diagram.edges.flatMap((e) =>
      (e.activities ?? []).filter((a) => a.kind === 'event').map((a) => a.name),
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
