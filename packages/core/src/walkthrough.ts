import { ACTIVITY_VERBS, Diagram, DiagramEdge, DiagramNode, eventLabel } from './diagram';

/** The state a walk starts in: the initial state. */
export function startOf(diagram: Diagram): DiagramNode | undefined {
  return diagram.nodes.find((n) => n.type === 'start');
}

/**
 * The transitions the saga can take from `nodeId`: those leaving it, and those of the Any node,
 * which apply in every state (but not in the initial or a final state, where nothing happens).
 * A join is passed once reached: its way on is offered at once.
 */
export function optionsAt(diagram: Diagram, nodeId: string): DiagramEdge[] {
  const node = diagram.nodes.find((n) => n.id === nodeId);
  if (!node || node.type === 'end') return [];
  const anyIds = new Set(diagram.nodes.filter((n) => n.type === 'any').map((n) => n.id));
  const applies = (e: DiagramEdge) =>
    e.source === nodeId || (node.type === 'state' && anyIds.has(e.source));
  return diagram.edges.filter(
    (e) =>
      e.kind === 'forward' &&
      applies(e) &&
      diagram.nodes.some((n) => n.id === e.target && n.type !== 'any'),
  );
}

/**
 * Follows the transitions `steps` from the initial state: the state each one leads to, or `null`
 * if the walk is not possible (no initial state, a transition that is gone or not offered).
 */
export function follow(diagram: Diagram, steps: readonly string[]): DiagramNode[] | null {
  const start = startOf(diagram);
  if (!start) return null;
  const path = [start];
  for (const id of steps) {
    const here = path[path.length - 1];
    const edge = optionsAt(diagram, here.id).find((e) => e.id === id);
    const next = edge && diagram.nodes.find((n) => n.id === edge.target);
    if (!next) return null;
    path.push(next);
  }
  return path;
}

/** What entering a state does, one line each: send, publish, request, start a routing slip, schedule. */
export function doingsOf(node: DiagramNode): string[] {
  return [
    ...(node.activities ?? []).map((a) => `${ACTIVITY_VERBS[a.kind]} ${a.name}`),
    ...(node.requests ?? []).map(
      (r) => `Request ${r.name}${r.timeout ? ` (wait ${r.timeout})` : ''}`,
    ),
    ...(node.routingSlips ?? []).map(
      (s) =>
        `Start routing slip ${s.name}${s.activities.length ? `: ${s.activities.map((a) => a.name).join(' → ')}` : ''}`,
    ),
    ...(node.timers ?? []).map(
      (t) =>
        `${t.action === 'schedule' ? 'Schedule' : 'Unschedule'} ${t.name}${t.delay ? ` in ${t.delay}` : ''}`,
    ),
  ];
}

/**
 * The walk as text, for reviews and tests:
 *
 *     Initial
 *     1. OrderReceived → Reserving stock
 *        Send ReserveStock
 *
 * A transition without an event reads `(no event)`; a guard follows the event in brackets.
 */
export function walkAsText(diagram: Diagram, steps: readonly string[]): string {
  const path = follow(diagram, steps);
  if (!path) return '';
  const lines = [path[0].name];
  steps.forEach((id, i) => {
    const edge = diagram.edges.find((e) => e.id === id)!;
    lines.push(`${i + 1}. ${eventLabel(edge) || '(no event)'} → ${path[i + 1].name}`);
    for (const doing of doingsOf(path[i + 1])) lines.push(`   ${doing}`);
  });
  return lines.join('\n');
}
