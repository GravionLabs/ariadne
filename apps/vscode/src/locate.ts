import type { Diagram, DiagramNode } from '@ariadne/core';
import type { CodeTarget } from '@ariadne/editor-protocol';
import { identifier, type ImportedSaga, type SourceLocation } from '@ariadne/masstransit';

/** How code and diagram name a node alike: states by their C# identifier, the others by type. */
function key(node: DiagramNode): string {
  return node.type === 'state' ? `state:${identifier(node.name, 'State')}` : node.type;
}

/**
 * Where a state or a transition of the diagram is in the code. The diagram and the one read from the
 * code (`code`) have different ids, so they are matched by name: a state by its identifier, a
 * transition by its two ends and its event. Nothing when the code has no such place (the initial
 * and final state are not declared, a transition was only drawn).
 */
export function locateInCode(
  diagram: Diagram,
  code: ImportedSaga,
  target: CodeTarget,
): SourceLocation | undefined {
  const find = (nodes: Diagram, node: DiagramNode | undefined) =>
    node && nodes.nodes.find((n) => key(n) === key(node));

  if (target.kind === 'state') {
    const node = diagram.nodes.find((n) => n.id === target.id);
    const same = find(code.diagram, node);
    return same && node?.type === 'state' ? code.locations.states[same.id] : undefined;
  }

  const edge = diagram.edges.find((e) => e.id === target.id);
  if (!edge) return undefined;
  const from = find(
    code.diagram,
    diagram.nodes.find((n) => n.id === edge.source),
  );
  const to = find(
    code.diagram,
    diagram.nodes.find((n) => n.id === edge.target),
  );
  if (!from || !to) return undefined;
  const same = code.diagram.edges.find(
    (e) => e.source === from.id && e.target === to.id && e.event === edge.event,
  );
  return same && code.locations.transitions[same.id];
}
