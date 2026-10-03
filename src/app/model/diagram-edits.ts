import {
  DEFAULT_NAMES,
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  NodeType,
  hasInput,
  hasOutput,
  nextId,
} from './diagram';

export type NodePatch = Partial<Omit<DiagramNode, 'id' | 'type'>>;
export type EdgePatch = Partial<Pick<DiagramEdge, 'event' | 'eventSource' | 'kind'>>;

/** A new diagram plus the id of the element the edit created. */
export interface Created {
  diagram: Diagram;
  id: string;
}

function newNode(d: Diagram, type: NodeType): DiagramNode {
  return { id: nextId(type, d.nodes), type, name: DEFAULT_NAMES[type] };
}

/** Adds an unconnected node, e.g. the start of an empty diagram. */
export function addNode(d: Diagram, type: NodeType): Created {
  const node = newNode(d, type);
  return { diagram: { ...d, nodes: [...d.nodes, node] }, id: node.id };
}

/**
 * Adds a node that follows `source`, connected by a forward edge. `null` if `source` is unknown or
 * the connection is not allowed.
 */
export function appendNode(d: Diagram, source: string, type: NodeType): Created | null {
  const from = d.nodes.find((n) => n.id === source);
  if (!from || !hasOutput(from.type) || !hasInput(type)) return null;
  const node = newNode(d, type);
  const edge: DiagramEdge = {
    id: nextId('edge', d.edges),
    source,
    target: node.id,
    kind: 'forward',
  };
  return {
    diagram: { ...d, nodes: [...d.nodes, node], edges: [...d.edges, edge] },
    id: node.id,
  };
}

/**
 * Splits edge A→B into A→X→B with a new state X. A→X keeps the edge's id and event (with its
 * source), so the transition out of A still reacts to the same event; X→B has no event yet. `null`
 * if the edge is unknown or `type` cannot sit in the middle of a path (start, end).
 */
export function insertOnEdge(d: Diagram, edgeId: string, type: NodeType): Created | null {
  const edge = d.edges.find((e) => e.id === edgeId);
  if (!edge || !hasInput(type) || !hasOutput(type)) return null;
  const node = newNode(d, type);
  const next: DiagramEdge = {
    id: nextId('edge', d.edges),
    source: node.id,
    target: edge.target,
    kind: edge.kind,
  };
  return {
    diagram: {
      ...d,
      nodes: [...d.nodes, node],
      edges: [...d.edges.map((e) => (e.id === edgeId ? { ...e, target: node.id } : e)), next],
    },
    id: node.id,
  };
}

export function updateNode(d: Diagram, id: string, patch: NodePatch): Diagram {
  return {
    ...d,
    nodes: d.nodes.map((n) => (n.id === id ? withoutUndefined({ ...n, ...patch }) : n)),
  };
}

export function updateEdge(d: Diagram, id: string, patch: EdgePatch): Diagram {
  return {
    ...d,
    edges: d.edges.map((e) => (e.id === id ? withoutUndefined({ ...e, ...patch }) : e)),
  };
}

/** Connects two nodes. `null` if the connection is not allowed or already exists. */
export function connect(
  d: Diagram,
  source: string,
  target: string,
  kind: EdgeKind = 'forward',
): Created | null {
  const from = d.nodes.find((n) => n.id === source);
  const to = d.nodes.find((n) => n.id === target);
  if (source === target || !from || !to || !hasOutput(from.type) || !hasInput(to.type)) {
    return null;
  }
  if (d.edges.some((e) => e.source === source && e.target === target && e.kind === kind)) {
    return null;
  }
  const id = nextId('edge', d.edges);
  return { diagram: { ...d, edges: [...d.edges, { id, source, target, kind }] }, id };
}

/**
 * Removes nodes (and every edge attached to them) and edges. Removing a single node that sits on
 * a path (one forward edge in, one out) closes the gap: A→X→B becomes A→B.
 */
export function removeElements(
  d: Diagram,
  selection: { nodeIds?: readonly string[]; edgeIds?: readonly string[] },
): Diagram {
  const nodeIds = new Set(selection.nodeIds ?? []);
  const edgeIds = new Set(selection.edgeIds ?? []);
  const bridge = nodeIds.size === 1 ? bridgeOver([...nodeIds][0], d.edges, edgeIds) : null;
  const edges = d.edges.filter(
    (e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
  );
  return {
    ...d,
    nodes: d.nodes.filter((n) => !nodeIds.has(n.id)),
    edges: bridge ? [...edges, bridge] : edges,
  };
}

/** The edge that replaces node `id` on its path, or `null` if it is not on a single path. */
function bridgeOver(
  id: string,
  edges: readonly DiagramEdge[],
  removedEdges: ReadonlySet<string>,
): DiagramEdge | null {
  const live = edges.filter((e) => e.kind === 'forward' && !removedEdges.has(e.id));
  const incoming = live.filter((e) => e.target === id);
  const outgoing = live.filter((e) => e.source === id);
  if (incoming.length !== 1 || outgoing.length !== 1) return null;
  const [into] = incoming;
  const [out] = outgoing;
  if (into.source === out.target) return null;
  const duplicate = edges.some(
    (e) => e.source === into.source && e.target === out.target && e.kind === 'forward',
  );
  return duplicate ? null : { ...into, target: out.target };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
