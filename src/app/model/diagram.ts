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

/** Connection point on a node's outline, as a compass direction. */
export type Port = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export const PORTS: readonly Port[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Ports used when an edge does not name one (files written before ports existed). */
export const DEFAULT_SOURCE_PORT: Port = 'e';
export const DEFAULT_TARGET_PORT: Port = 'w';

/** The port facing `port`, e.g. `w` for `e`. */
export const oppositePort = (port: Port): Port => PORTS[(PORTS.indexOf(port) + 4) % 8];

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  sourcePort?: Port;
  targetPort?: Port;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

/** A start node has no incoming connections, an end node no outgoing ones. */
export const hasInput = (type: NodeType): boolean => type !== 'start';
export const hasOutput = (type: NodeType): boolean => type !== 'end';

export const emptyDiagram = (): Diagram => ({ nodes: [], edges: [] });

/** Connector id used by f-flow: every node exposes one connector per {@link Port}. */
export const connectorId = (nodeId: string, port: Port): string => `${nodeId}:${port}`;

/** Inverse of {@link connectorId}; returns the node id. */
export const nodeIdOfConnector = (id: string): string => id.slice(0, id.lastIndexOf(':'));

/** Inverse of {@link connectorId}; returns the port. */
export const portOfConnector = (id: string): Port => id.slice(id.lastIndexOf(':') + 1) as Port;

/** Next free id of the form `<prefix>-<n>` (stable, human-readable, git-friendly). */
export function nextId(prefix: string, existing: readonly { id: string }[]): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = existing.reduce((acc, { id }) => {
    const match = pattern.exec(id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}-${max + 1}`;
}
