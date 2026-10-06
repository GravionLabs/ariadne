import { describe, expect, it } from 'vitest';
import { Diagram, emptyDiagram } from './diagram';
import {
  addNode,
  addOutcomeTransitions,
  missingOutcomes,
  appendNode,
  connect,
  insertOnEdge,
  removeElements,
  retargetEdge,
  setEdgeEvent,
  updateDetails,
  updateEventInfo,
  updateSaga,
  updateEdge,
  updateNode,
} from './diagram-edits';

/** start-1 → state-1 → end-1, as plain data. */
function path(): Diagram {
  return {
    ...emptyDiagram(),
    nodes: [
      { id: 'start-1', type: 'start', name: 'Initial' },
      { id: 'state-1', type: 'state', name: 'Mid' },
      { id: 'end-1', type: 'end', name: 'Done' },
    ],
    edges: [
      { id: 'edge-1', source: 'start-1', target: 'state-1', kind: 'forward', event: 'Go' },
      { id: 'edge-2', source: 'state-1', target: 'end-1', kind: 'forward' },
    ],
  };
}

describe('diagram edits', () => {
  it('adds an unconnected node without touching the input', () => {
    const before = path();
    const { diagram, id } = addNode(before, 'state');
    expect(diagram.nodes.at(-1)).toMatchObject({ id, type: 'state' });
    expect(diagram.nodes).toHaveLength(4);
    expect(before.nodes).toHaveLength(3);
  });

  it('appends a node with a forward edge', () => {
    const result = appendNode(path(), 'state-1', 'state')!;
    expect(result.diagram.nodes.at(-1)!.id).toBe(result.id);
    expect(result.diagram.edges.at(-1)).toMatchObject({
      source: 'state-1',
      target: result.id,
      kind: 'forward',
    });
  });

  it('names the appended state and gives its transition an event', () => {
    const { diagram, id } = appendNode(path(), 'state-1', 'state', {
      name: ' Charged ',
      event: ' PaymentCharged ',
    })!;
    expect(diagram.nodes.at(-1)).toMatchObject({ id, name: 'Charged' });
    expect(diagram.edges.at(-1)).toMatchObject({ target: id, event: 'PaymentCharged' });
  });

  it('keeps the default name and no event for blank fields', () => {
    const plain = appendNode(path(), 'state-1', 'state')!;
    const blank = appendNode(path(), 'state-1', 'state', { name: ' ', event: '' })!;
    expect(blank.diagram).toEqual(plain.diagram);
    expect(blank.diagram.edges.at(-1)!.event).toBeUndefined();
  });

  it('refuses to append after an end or to a start', () => {
    expect(appendNode(path(), 'end-1', 'state')).toBeNull();
    expect(appendNode(path(), 'state-1', 'start')).toBeNull();
    expect(appendNode(path(), 'missing', 'state')).toBeNull();
  });

  it('splits an edge, keeping the id and event on the first half', () => {
    const { diagram, id } = insertOnEdge(path(), 'edge-1', 'state')!;
    expect(diagram.edges.find((e) => e.id === 'edge-1')).toMatchObject({
      source: 'start-1',
      target: id,
      event: 'Go',
    });
    const second = diagram.edges.find((e) => e.source === id)!;
    expect(second).toMatchObject({ target: 'state-1', kind: 'forward' });
    expect(second.event).toBeUndefined();
  });

  it('gives the second half of a split edge the event, and the first half keeps its own', () => {
    const { diagram, id } = insertOnEdge(path(), 'edge-1', 'state', {
      name: 'Charged',
      event: 'PaymentCharged',
    })!;
    expect(diagram.nodes.find((n) => n.id === id)!.name).toBe('Charged');
    expect(diagram.edges.find((e) => e.id === 'edge-1')).toMatchObject({ event: 'Go' });
    expect(diagram.edges.find((e) => e.source === id)).toMatchObject({
      target: 'state-1',
      event: 'PaymentCharged',
    });
  });

  it('refuses to split an edge with a start or an end', () => {
    expect(insertOnEdge(path(), 'edge-1', 'end')).toBeNull();
    expect(insertOnEdge(path(), 'edge-1', 'start')).toBeNull();
    expect(insertOnEdge(path(), 'missing', 'state')).toBeNull();
  });

  it('drops patched fields set to undefined', () => {
    const named = updateNode(path(), 'state-1', { description: 'Text' });
    expect(named.nodes[1].description).toBe('Text');
    const cleared = updateNode(named, 'state-1', { description: undefined });
    expect('description' in cleared.nodes[1]).toBe(false);

    const edge = updateEdge(path(), 'edge-1', { event: undefined });
    expect('event' in edge.edges[0]).toBe(false);
  });

  it('connects two nodes once', () => {
    const first = connect(path(), 'start-1', 'end-1')!;
    expect(first.diagram.edges.at(-1)).toMatchObject({ source: 'start-1', target: 'end-1' });
    expect(connect(first.diagram, 'start-1', 'end-1')).toBeNull();
    // A state may lead to itself (a loop), also only once.
    const loop = connect(path(), 'state-1', 'state-1')!;
    expect(loop.diagram.edges.at(-1)).toMatchObject({ source: 'state-1', target: 'state-1' });
    expect(connect(loop.diagram, 'state-1', 'state-1')).toBeNull();
    expect(connect(path(), 'end-1', 'state-1')).toBeNull();
  });

  it('closes the gap when removing a node on a path', () => {
    const { nodes, edges } = removeElements(path(), { nodeIds: ['state-1'] });
    expect(nodes.map((n) => n.id)).toEqual(['start-1', 'end-1']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'start-1', target: 'end-1', event: 'Go' });
  });

  it('removes attached edges without a bridge for several nodes', () => {
    const { nodes, edges } = removeElements(path(), { nodeIds: ['state-1', 'end-1'] });
    expect(nodes.map((n) => n.id)).toEqual(['start-1']);
    expect(edges).toEqual([]);
  });

  it('removes only the selected edge', () => {
    const { nodes, edges } = removeElements(path(), { edgeIds: ['edge-2'] });
    expect(nodes).toHaveLength(3);
    expect(edges.map((e) => e.id)).toEqual(['edge-1']);
  });

  it('sets and clears the name and description', () => {
    const named = updateDetails(path(), { name: '  Order Saga ', description: 'About it' });
    expect(named).toMatchObject({ name: 'Order Saga', description: 'About it' });
    const renamed = updateDetails(named, { name: 'Other' });
    expect(renamed).toMatchObject({ name: 'Other', description: 'About it' });
    const cleared = updateDetails(renamed, { name: '   ', description: undefined });
    expect('name' in cleared).toBe(false);
    expect('description' in cleared).toBe(false);
  });

  it('adds the any node once; asking again gives the same diagram', () => {
    const first = addNode(path(), 'any');
    expect(first.diagram.nodes.at(-1)).toMatchObject({
      id: 'any-1',
      type: 'any',
      name: 'Any state',
    });
    const again = addNode(first.diagram, 'any');
    expect(again.diagram).toBe(first.diagram);
    expect(again.id).toBe('any-1');
  });

  it('lets transitions leave the any node but never enter it', () => {
    const { diagram } = addNode(path(), 'any');
    expect(connect(diagram, 'any-1', 'state-1')).not.toBeNull();
    expect(appendNode(diagram, 'any-1', 'state')).not.toBeNull();
    expect(connect(diagram, 'state-1', 'any-1')).toBeNull();
    expect(insertOnEdge(diagram, 'edge-1', 'any')).toBeNull();
    expect(appendNode(diagram, 'state-1', 'any')).toBeNull();
  });

  it('adds a join after a state and into the middle of a transition, and lets it connect on', () => {
    const appended = appendNode(path(), 'state-1', 'join')!;
    expect(appended.diagram.nodes.at(-1)).toMatchObject({ type: 'join', name: 'Join' });
    expect(connect(appended.diagram, appended.id, 'end-1')).not.toBeNull();
    const inserted = insertOnEdge(path(), 'edge-2', 'join')!;
    expect(inserted.diagram.edges.map((e) => [e.source, e.target])).toEqual([
      ['start-1', 'state-1'],
      ['state-1', inserted.id],
      [inserted.id, 'end-1'],
    ]);
  });

  it('points a transition at another state, keeping everything else', () => {
    const next = retargetEdge(path(), 'edge-1', 'end-1')!;
    expect(next.edges[0]).toEqual({ ...path().edges[0], target: 'end-1' });
    expect(next.edges[1]).toEqual(path().edges[1]);
  });

  it('makes a loop when pointed back at an earlier state', () => {
    // start → state-1 → end-1, and state-1 → new → end-1; then new → end-1 is pointed at state-1.
    const longer = appendNode(path(), 'state-1', 'state')!;
    const toEnd = connect(longer.diagram, longer.id, 'end-1')!;
    const looped = retargetEdge(toEnd.diagram, toEnd.id, 'state-1');
    expect(looped?.edges.at(-1)).toMatchObject({ source: longer.id, target: 'state-1' });
  });

  it('refuses an unknown edge or state, a state that cannot be entered and duplicates', () => {
    expect(retargetEdge(path(), 'nope', 'end-1')).toBeNull();
    expect(retargetEdge(path(), 'edge-1', 'nope')).toBeNull();
    expect(retargetEdge(path(), 'edge-2', 'start-1')).toBeNull();
    expect(retargetEdge(path(), 'edge-1', 'start-1')).toBeNull();
    const twin = {
      ...path(),
      edges: [
        ...path().edges,
        {
          id: 'edge-3',
          source: 'start-1',
          target: 'end-1',
          kind: 'forward' as const,
          event: 'Go',
        },
      ],
    };
    expect(retargetEdge(twin, 'edge-1', 'end-1')).toBeNull();
    // The same states with another event or guard are a different transition.
    const other = {
      ...twin,
      edges: twin.edges.map((e) => (e.id === 'edge-3' ? { ...e, guard: 'big' } : e)),
    };
    expect(retargetEdge(other, 'edge-1', 'end-1')).not.toBeNull();
  });

  it('lets a transition lead back to its own source', () => {
    const next = retargetEdge(path(), 'edge-2', 'state-1')!;
    expect(next.edges[1]).toMatchObject({ source: 'state-1', target: 'state-1' });
  });

  it('returns the same diagram when the target does not change', () => {
    const d = path();
    expect(retargetEdge(d, 'edge-1', 'state-1')).toBe(d);
  });

  describe('code metadata', () => {
    it('sets and merges fields of the saga, trimmed', () => {
      const first = updateSaga(path(), { className: ' OrderStateMachine ', namespace: 'Shop' });
      expect(first.saga).toEqual({ className: 'OrderStateMachine', namespace: 'Shop' });
      const second = updateSaga(first, { instanceType: 'OrderState' });
      expect(second.saga).toEqual({
        className: 'OrderStateMachine',
        namespace: 'Shop',
        instanceType: 'OrderState',
      });
    });

    it('removes a field set to empty, and the block when nothing is left', () => {
      const set = updateSaga(path(), { className: 'A', namespace: 'B' });
      expect(updateSaga(set, { namespace: '  ' }).saga).toEqual({ className: 'A' });
      const none = updateSaga(set, { className: '', namespace: undefined });
      expect('saga' in none).toBe(false);
    });

    it('creates an event entry, keeps the order, and removes an entry that became empty', () => {
      let d = updateEventInfo(path(), 'Go', { messageType: 'GoNow' });
      d = updateEventInfo(d, 'Next', { correlation: 'x => x.Id' });
      d = updateEventInfo(d, 'Go', { correlation: 'CorrelationId' });
      expect(d.events).toEqual([
        { name: 'Go', messageType: 'GoNow', correlation: 'CorrelationId' },
        { name: 'Next', correlation: 'x => x.Id' },
      ]);
      d = updateEventInfo(d, 'Go', { messageType: '' });
      expect(d.events?.[0]).toEqual({ name: 'Go', correlation: 'CorrelationId' });
      d = updateEventInfo(d, 'Go', { correlation: undefined });
      expect(d.events).toEqual([{ name: 'Next', correlation: 'x => x.Id' }]);
      d = updateEventInfo(d, 'Next', { correlation: '' });
      expect('events' in d).toBe(false);
    });

    it('does not create an entry for nothing', () => {
      expect('events' in updateEventInfo(path(), 'Go', { messageType: ' ' })).toBe(false);
    });

    it('does not touch the input', () => {
      const d = path();
      const before = JSON.stringify(d);
      updateSaga(d, { className: 'X' });
      updateEventInfo(d, 'Go', { messageType: 'Y' });
      expect(JSON.stringify(d)).toBe(before);
    });
  });
});

describe('setEdgeEvent', () => {
  it('sets, trims and clears the event', () => {
    const set = setEdgeEvent(path(), 'edge-2', ' Done ')!;
    expect(set.edges.find((e) => e.id === 'edge-2')!.event).toBe('Done');
    const cleared = setEdgeEvent(set, 'edge-2', '  ')!;
    expect('event' in cleared.edges.find((e) => e.id === 'edge-2')!).toBe(false);
  });

  it('changes nothing when the event is the same', () => {
    const d = path();
    expect(setEdgeEvent(d, 'edge-1', 'Go')).toBe(d);
  });

  it('refuses an event that would duplicate another transition', () => {
    const d = path();
    d.edges.push({ id: 'edge-3', source: 'start-1', target: 'state-1', kind: 'forward' });
    expect(setEdgeEvent(d, 'edge-3', 'Go')).toBeNull();
    expect(setEdgeEvent(d, 'missing', 'Go')).toBeNull();
  });
});

describe('outcome transitions', () => {
  const withRequest = (): Diagram => {
    const d = path();
    d.nodes[1] = {
      ...d.nodes[1],
      requests: [{ name: 'ChargeCard' }],
      routingSlips: [{ name: 'Ship', activities: [{ name: 'Pack' }] }],
      timers: [
        { name: 'PaymentExpired', action: 'schedule' },
        { name: 'PaymentExpired', action: 'unschedule' },
      ],
    };
    return d;
  };

  it('adds a transition to a new state for each outcome of a request, with its event', () => {
    const next = addOutcomeTransitions(withRequest(), 'state-1', { kind: 'request', index: 0 })!;
    const added = next.edges.slice(2);
    expect(added.map((e) => e.event)).toEqual([
      'ChargeCard.Completed',
      'ChargeCard.Faulted',
      'ChargeCard.TimeoutExpired',
    ]);
    expect(added.every((e) => e.source === 'state-1' && e.kind === 'forward')).toBe(true);
    expect(new Set(added.map((e) => e.target)).size).toBe(3);
    expect(next.nodes).toHaveLength(6);
  });

  it('does the same for the two outcomes of a routing slip and the one of a scheduled timeout', () => {
    const d = withRequest();
    const slip = addOutcomeTransitions(d, 'state-1', { kind: 'routingSlip', index: 0 })!;
    expect(slip.edges.slice(2).map((e) => e.event)).toEqual(['Ship.Completed', 'Ship.Faulted']);
    const timer = addOutcomeTransitions(d, 'state-1', { kind: 'timer', index: 0 })!;
    expect(timer.edges.slice(2).map((e) => e.event)).toEqual(['PaymentExpired']);
  });

  it('skips the outcomes that already have a transition from the state', () => {
    const d = withRequest();
    d.edges[1] = { ...d.edges[1], event: 'ChargeCard.Faulted' };
    const source = { kind: 'request', index: 0 } as const;
    expect(missingOutcomes(d, 'state-1', source)).toEqual([
      'ChargeCard.Completed',
      'ChargeCard.TimeoutExpired',
    ]);
    const next = addOutcomeTransitions(d, 'state-1', source)!;
    expect(next.edges.slice(2).map((e) => e.event)).toEqual([
      'ChargeCard.Completed',
      'ChargeCard.TimeoutExpired',
    ]);
    // With none missing there is nothing to add.
    expect(addOutcomeTransitions(next, 'state-1', source)).toBeNull();
  });

  it('has nothing to add for an unschedule, an unknown source or a state that cannot be left', () => {
    const d = withRequest();
    expect(addOutcomeTransitions(d, 'state-1', { kind: 'timer', index: 1 })).toBeNull();
    expect(addOutcomeTransitions(d, 'state-1', { kind: 'request', index: 5 })).toBeNull();
    expect(addOutcomeTransitions(d, 'end-1', { kind: 'request', index: 0 })).toBeNull();
  });
});
