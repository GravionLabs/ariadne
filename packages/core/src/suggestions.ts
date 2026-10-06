import { Diagram, DiagramNode } from './diagram';
import { outcomeEventsOf } from './diagram-edits';

export interface SuggestOptions {
  /** The state the transition leaves: what it makes possible comes first. */
  from?: string;
  /** The transition being edited, whose own event does not count as taken. */
  edge?: string;
}

/** What a state makes possible: the outcomes of its requests and routing slips, its scheduled timeouts. */
const ownEvents = (n: DiagramNode): string[] =>
  (
    [
      ['request', n.requests],
      ['routingSlip', n.routingSlips],
      ['timer', n.timers],
    ] as const
  ).flatMap(([kind, rows]) =>
    (rows ?? []).flatMap((_, index) => outcomeEventsOf(n, { kind, index })),
  );

/**
 * The events the diagram itself gives names to: the outcomes of requests and routing slips,
 * scheduled timeouts and joins. They need no naming hint, whatever they are called.
 */
export const outcomeEvents = (d: Diagram): string[] => [
  ...d.nodes.flatMap(ownEvents),
  ...d.nodes.flatMap((n) => (n.type === 'join' ? [n.name] : [])),
];

/**
 * Events worth offering for a transition, best first: what the source state makes possible, then the
 * same of every other state and the events of joins, the events the saga publishes, the events of
 * other transitions, and the events known from code (`events`, from a C# import). Without
 * duplicates, and without an event another transition leaving the same state already reacts to.
 */
export function suggestEvents(d: Diagram, { from, edge }: SuggestOptions = {}): string[] {
  const source = from ? d.nodes.find((n) => n.id === from) : undefined;
  const taken = new Set(
    from
      ? d.edges.filter((e) => e.source === from && e.id !== edge).flatMap((e) => e.event ?? [])
      : [],
  );
  const all = [
    ...(source ? ownEvents(source) : []),
    ...d.nodes.flatMap(ownEvents),
    ...d.nodes.flatMap((n) => (n.type === 'join' ? [n.name] : [])),
    ...d.nodes.flatMap((n) =>
      (n.activities ?? []).filter((a) => a.kind === 'event').map((a) => a.name),
    ),
    ...d.edges.flatMap((e) => e.event ?? []),
    ...(d.events ?? []).map((e) => e.name),
  ];
  return [...new Set(all)].filter((event) => event && !taken.has(event));
}
