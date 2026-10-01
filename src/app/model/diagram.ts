export interface Point {
  x: number;
  y: number;
}

export type NodeType = 'start' | 'end' | 'step' | 'decision';
export type EdgeKind = 'forward' | 'compensation';

/** Undo action that runs when a later step of the saga fails. Only steps can have one. */
export interface Compensation {
  name: string;
  description?: string;
}

export interface DiagramNode {
  id: string;
  type: NodeType;
  name: string;
  position: Point;
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
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

/** A start node has no incoming connections, an end node no outgoing ones. */
export const hasInput = (type: NodeType): boolean => type !== 'start';
export const hasOutput = (type: NodeType): boolean => type !== 'end';

export const emptyDiagram = (): Diagram => ({ nodes: [], edges: [] });

/** Connector ids used by f-flow: every node exposes one `in` and one `out` connector. */
export const inConnectorId = (nodeId: string): string => `${nodeId}:in`;
export const outConnectorId = (nodeId: string): string => `${nodeId}:out`;

/** Inverse of {@link inConnectorId} / {@link outConnectorId}; returns the node id. */
export const nodeIdOfConnector = (connectorId: string): string =>
  connectorId.slice(0, connectorId.lastIndexOf(':'));

/** Next free id of the form `<prefix>-<n>` (stable, human-readable, git-friendly). */
export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existing.reduce((acc, { id }) => {
    const match = pattern.exec(id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${max + 1}`;
}
