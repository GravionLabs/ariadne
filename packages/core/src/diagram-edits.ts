import {
  DEFAULT_NAMES,
  Diagram,
  EventInfo,
  SagaInfo,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  NodeType,
  hasInput,
  hasOutput,
  REQUEST_OUTCOMES,
  SLIP_OUTCOMES,
  nextId,
  requestEvent,
  slipEvent,
} from './diagram';

export type NodePatch = Partial<Omit<DiagramNode, 'id' | 'type'>>;
export type SagaPatch = Partial<SagaInfo>;
export type EventInfoPatch = Partial<Omit<EventInfo, 'name'>>;
export type DetailsPatch = Partial<Pick<Diagram, 'name' | 'description'>>;
export type EdgePatch = Partial<Pick<DiagramEdge, 'event' | 'eventSource' | 'guard' | 'kind'>>;

/** A new diagram plus the id of the element the edit created. */
export interface Created {
  diagram: Diagram;
  id: string;
}

/** What a new state can be given when it is added: a name, and the event of its transition. */
export interface NewStateInit {
  name?: string;
  event?: string;
}

function newNode(d: Diagram, type: NodeType, name?: string): DiagramNode {
  return { id: nextId(type, d.nodes), type, name: name?.trim() || DEFAULT_NAMES[type] };
}

/** Adds an unconnected node, e.g. the start of an empty diagram. */
export function addNode(d: Diagram, type: NodeType): Created {
  // There is only one "any" node: asking for another gives the existing one, unchanged.
  const existing = type === 'any' ? d.nodes.find((n) => n.type === 'any') : undefined;
  if (existing) return { diagram: d, id: existing.id };
  const node = newNode(d, type);
  return { diagram: { ...d, nodes: [...d.nodes, node] }, id: node.id };
}

/**
 * Adds a node that follows `source`, connected by a forward edge. `null` if `source` is unknown or
 * the connection is not allowed.
 */
export function appendNode(
  d: Diagram,
  source: string,
  type: NodeType,
  init: NewStateInit = {},
): Created | null {
  const from = d.nodes.find((n) => n.id === source);
  if (!from || !hasOutput(from.type) || !hasInput(type)) return null;
  const node = newNode(d, type, init.name);
  const event = init.event?.trim();
  const edge: DiagramEdge = {
    id: nextId('edge', d.edges),
    source,
    target: node.id,
    kind: 'forward',
    ...(event ? { event } : {}),
  };
  return {
    diagram: { ...d, nodes: [...d.nodes, node], edges: [...d.edges, edge] },
    id: node.id,
  };
}

/**
 * Splits edge A→B into A→X→B with a new state X. A→X keeps the edge's id and event (with its
 * source), so the transition out of A still reacts to the same event; X→B has the event of `init`,
 * if any. `null` if the edge is unknown or `type` cannot sit in the middle of a path (start, end).
 */
export function insertOnEdge(
  d: Diagram,
  edgeId: string,
  type: NodeType,
  init: NewStateInit = {},
): Created | null {
  const edge = d.edges.find((e) => e.id === edgeId);
  if (!edge || !hasInput(type) || !hasOutput(type)) return null;
  const node = newNode(d, type, init.name);
  const event = init.event?.trim();
  const next: DiagramEdge = {
    id: nextId('edge', d.edges),
    source: node.id,
    target: edge.target,
    kind: edge.kind,
    ...(event ? { event } : {}),
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

/** Something a state does that ends in events: a request, a routing slip or a scheduled timeout. */
export interface OutcomeSource {
  kind: 'request' | 'routingSlip' | 'timer';
  /** Its position in the state's `requests`, `routingSlips` or `timers`. */
  index: number;
}

/**
 * The events a request (`Name.Completed`, `.Faulted`, `.TimeoutExpired`), a routing slip
 * (`.Completed`, `.Faulted`) or a scheduled timer (its name) ends in. None for an unknown source or
 * an unschedule.
 */
export function outcomeEventsOf(node: DiagramNode, source: OutcomeSource): string[] {
  if (source.kind === 'request') {
    const request = node.requests?.[source.index];
    return request ? REQUEST_OUTCOMES.map((o) => requestEvent(request.name, o)) : [];
  }
  if (source.kind === 'routingSlip') {
    const slip = node.routingSlips?.[source.index];
    return slip ? SLIP_OUTCOMES.map((o) => slipEvent(slip.name, o)) : [];
  }
  const timer = node.timers?.[source.index];
  return timer?.action === 'schedule' && timer.name ? [timer.name] : [];
}

/** The outcomes of `source` that no transition leaving the state reacts to yet. */
export function missingOutcomes(d: Diagram, nodeId: string, source: OutcomeSource): string[] {
  const node = d.nodes.find((n) => n.id === nodeId);
  if (!node || !hasOutput(node.type)) return [];
  const handled = new Set(d.edges.filter((e) => e.source === nodeId).map((e) => e.event));
  return outcomeEventsOf(node, source).filter((event) => !handled.has(event));
}

/**
 * Adds a transition to a new state for each outcome of a request, routing slip or scheduled timeout
 * that the state does not react to yet, with the event filled in. `null` if there is nothing to add.
 */
export function addOutcomeTransitions(
  d: Diagram,
  nodeId: string,
  source: OutcomeSource,
): Diagram | null {
  const events = missingOutcomes(d, nodeId, source);
  if (!events.length) return null;
  return events.reduce<Diagram>(
    (current, event) => appendNode(current, nodeId, 'state', { event })?.diagram ?? current,
    d,
  );
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

/**
 * Whether two transitions are the same one: same states, kind, event and guard. Several
 * transitions may lead between the same two states as long as they differ in event or guard.
 */
export const sameTransition = (
  a: Pick<DiagramEdge, 'source' | 'target' | 'kind' | 'event' | 'guard'>,
  b: Pick<DiagramEdge, 'source' | 'target' | 'kind' | 'event' | 'guard'>,
): boolean =>
  a.source === b.source &&
  a.target === b.target &&
  a.kind === b.kind &&
  (a.event ?? '') === (b.event ?? '') &&
  (a.guard ?? '') === (b.guard ?? '');

/**
 * Points a transition at another state. `null` if the transition or the state is unknown, the
 * state cannot be entered, or the transition would duplicate another one (same states, kind,
 * event and guard). Pointing it back at an earlier state, or at its own source, makes a loop.
 */
export function retargetEdge(d: Diagram, edgeId: string, target: string): Diagram | null {
  const edge = d.edges.find((e) => e.id === edgeId);
  const to = d.nodes.find((n) => n.id === target);
  if (!edge || !to || !hasInput(to.type)) return null;
  if (target === edge.target) return d;
  const duplicate = d.edges.some((e) => e.id !== edgeId && sameTransition(e, { ...edge, target }));
  if (duplicate) return null;
  return { ...d, edges: d.edges.map((e) => (e.id === edgeId ? { ...e, target } : e)) };
}

/**
 * Sets the event of a transition; an empty text removes it. `null` if the transition is unknown or
 * it would then duplicate another one (same states, kind, event and guard).
 */
export function setEdgeEvent(
  d: Diagram,
  edgeId: string,
  event: string | undefined,
): Diagram | null {
  const edge = d.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const value = event?.trim() || undefined;
  if (value === edge.event) return d;
  const duplicate = d.edges.some(
    (e) => e.id !== edgeId && sameTransition(e, { ...edge, event: value }),
  );
  if (duplicate) return null;
  return {
    ...d,
    edges: d.edges.map((e) => (e.id === edgeId ? withoutUndefined({ ...e, event: value }) : e)),
  };
}

/** Sets the saga's name and/or description; an empty text removes it. */
export function updateDetails(d: Diagram, patch: DetailsPatch): Diagram {
  const text = (value: string | undefined) => value?.trim() || undefined;
  return withoutUndefined({
    ...d,
    ...('name' in patch ? { name: text(patch.name) } : {}),
    ...('description' in patch ? { description: text(patch.description) } : {}),
  });
}

/** The diagram without one optional field. */
const omit = (d: Diagram, key: 'saga' | 'events'): Diagram =>
  Object.fromEntries(Object.entries(d).filter(([k]) => k !== key)) as unknown as Diagram;

/** The text, trimmed; `undefined` when nothing is left. */
const text = (value: string | undefined): string | undefined => value?.trim() || undefined;

/** Sets fields of the saga's code metadata; an empty text removes a field, no field removes the block. */
export function updateSaga(d: Diagram, patch: SagaPatch): Diagram {
  const merged = withoutUndefined({
    ...d.saga,
    ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, text(value)])),
  }) as SagaInfo;
  return Object.keys(merged).length ? { ...d, saga: merged } : omit(d, 'saga');
}

/**
 * Sets what is known in code about an event (message type, correlation). The entry is created when
 * needed and removed again when nothing is left in it. Entries keep the order they were created in.
 */
export function updateEventInfo(d: Diagram, name: string, patch: EventInfoPatch): Diagram {
  const events = d.events ?? [];
  const current = events.find((e) => e.name === name);
  const next: EventInfo = withoutUndefined({
    name,
    messageType: 'messageType' in patch ? text(patch.messageType) : current?.messageType,
    correlation: 'correlation' in patch ? text(patch.correlation) : current?.correlation,
  });
  const empty = next.messageType === undefined && next.correlation === undefined;
  const list = current
    ? events.map((e) => (e.name === name ? next : e)).filter((e) => !(e === next && empty))
    : empty
      ? events
      : [...events, next];
  return list.length ? { ...d, events: list } : omit(d, 'events');
}

/**
 * Connects two nodes (a node to itself is a loop). `null` if not allowed, or if a transition
 * without an event already leads there: a second one is welcome once the first has an event.
 */
export function connect(
  d: Diagram,
  source: string,
  target: string,
  kind: EdgeKind = 'forward',
): Created | null {
  const from = d.nodes.find((n) => n.id === source);
  const to = d.nodes.find((n) => n.id === target);
  if (!from || !to || !hasOutput(from.type) || !hasInput(to.type)) {
    return null;
  }
  if (d.edges.some((e) => sameTransition(e, { source, target, kind }))) {
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
