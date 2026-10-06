import { Diagram, REQUEST_OUTCOMES, SLIP_OUTCOMES, requestEvent, slipEvent } from './diagram';

/** Events worth offering for a transition: the outcomes of requests and routing slips, scheduled timeouts, joins. */
export function suggestEvents(d: Diagram): string[] {
  return d.nodes.flatMap((n) => [
    ...(n.requests ?? []).flatMap((r) => REQUEST_OUTCOMES.map((o) => requestEvent(r.name, o))),
    ...(n.routingSlips ?? []).flatMap((s) => SLIP_OUTCOMES.map((o) => slipEvent(s.name, o))),
    ...(n.timers ?? []).filter((t) => t.action === 'schedule').map((t) => t.name),
    ...(n.type === 'join' ? [n.name] : []),
  ]);
}
