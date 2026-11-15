import { Diagram, DiagramEdge, DiagramNode } from './diagram';

/** What a merge dropped: an element of the existing diagram that the new input no longer has. */
export interface MergeRemoval {
  kind: 'node' | 'edge';
  id: string;
  /** For people: `State “Reserving” removed, its description is lost`. */
  message: string;
}

export interface MergeResult {
  diagram: Diagram;
  removed: MergeRemoval[];
}

/** The fields of a node that a person writes and that stay as they are in the existing file. */
const NODE_KEPT = ['description', 'color', 'retry', 'timeout', 'compensation'] as const;

const edgeKey = (e: Pick<DiagramEdge, 'source' | 'target' | 'event' | 'guard'>): string =>
  JSON.stringify([e.source, e.target, e.event ?? null, e.guard ?? null]);

/**
 * Merges a diagram that comes from code (or any tool) into the one a person has been editing, by the
 * rules of `docs/specs/diagram-merge.md`: structure comes from `incoming`; name and description of
 * the diagram, direction, spacing, per node description, color, retry, timeout and compensation,
 * per edge eventSource and kind come from `existing` (where it sets them). Nodes are matched by id,
 * edges by source, target, event and guard. The order of `existing` is kept, new elements are
 * appended. Elements only `existing` has are dropped and reported.
 */
export function mergeDiagram(existing: Diagram, incoming: Diagram): MergeResult {
  const removed: MergeRemoval[] = [];

  const oldNodes = new Map(existing.nodes.map((n) => [n.id, n]));
  const newNodes = new Map(incoming.nodes.map((n) => [n.id, n]));
  const nodes: DiagramNode[] = [];
  for (const old of existing.nodes) {
    const fresh = newNodes.get(old.id);
    if (!fresh) {
      const lost = NODE_KEPT.filter((k) => old[k] !== undefined);
      removed.push({
        kind: 'node',
        id: old.id,
        message: `“${old.name}” removed${lost.length ? `, its ${lost.join(', ')} ${lost.length === 1 ? 'is' : 'are'} lost` : ''}`,
      });
      continue;
    }
    nodes.push(mergeNode(old, fresh));
  }
  for (const fresh of incoming.nodes) if (!oldNodes.has(fresh.id)) nodes.push(fresh);

  const nameOf = (id: string) =>
    existing.nodes.find((n) => n.id === id)?.name ??
    incoming.nodes.find((n) => n.id === id)?.name ??
    id;
  const oldEdges = new Map(existing.edges.map((e) => [edgeKey(e), e]));
  const newEdges = new Map(incoming.edges.map((e) => [edgeKey(e), e]));
  const edges: DiagramEdge[] = [];
  for (const old of existing.edges) {
    const fresh = newEdges.get(edgeKey(old));
    if (!fresh) {
      removed.push({
        kind: 'edge',
        id: old.id,
        message: `Transition ${nameOf(old.source)} → ${nameOf(old.target)}${old.event ? ` on ${old.event}` : ''} removed${old.eventSource ? ', its eventSource is lost' : ''}`,
      });
      continue;
    }
    edges.push({
      ...fresh,
      id: old.id,
      kind: old.kind,
      ...(old.eventSource !== undefined ? { eventSource: old.eventSource } : {}),
    });
  }
  for (const fresh of incoming.edges) if (!oldEdges.has(edgeKey(fresh))) edges.push(fresh);

  const diagram: Diagram = { ...incoming, direction: existing.direction, nodes, edges };
  if (existing.name !== undefined) diagram.name = existing.name;
  if (existing.description !== undefined) diagram.description = existing.description;
  if (existing.spacing !== undefined) diagram.spacing = existing.spacing;
  return { diagram, removed };
}

function mergeNode(old: DiagramNode, fresh: DiagramNode): DiagramNode {
  const merged: DiagramNode = { ...fresh };
  for (const key of NODE_KEPT) {
    if (old[key] !== undefined) (merged as unknown as Record<string, unknown>)[key] = old[key];
  }
  return merged;
}
