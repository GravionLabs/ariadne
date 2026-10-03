import orderSaga from '../../../docs/examples/order.saga.yaml';
import travelBooking from '../../../docs/examples/travel-booking.saga.yaml';
import { eventKindOf, joinEventsOf, publishedEvents } from './diagram';
import { backEdgeIds } from '../editor/diagram-layout';
import { parseDiagramWithNotes, serializeDiagram } from './diagram-yaml';

describe('docs/examples/order.saga.yaml', () => {
  const { diagram, notes } = parseDiagramWithNotes(orderSaga);

  it('is a valid, current-format diagram', () => {
    expect(notes).toEqual([]);
    expect(diagram.nodes.map((n) => n.type)).toEqual([
      'start',
      'state',
      'state',
      'state',
      'end',
      'end',
    ]);
    expect(diagram.edges).toHaveLength(8);
  });

  it('is written exactly as the editor would save it', () => {
    expect(serializeDiagram(diagram)).toBe(orderSaga);
  });

  it('shows the three kinds of messages: commands, a published event, external events', () => {
    const activities = diagram.nodes.flatMap((n) => n.activities ?? []);
    expect(activities.filter((a) => a.kind === 'command')).toHaveLength(3);
    expect([...publishedEvents(diagram)]).toEqual(['OrderAccepted']);
    const kindOf = eventKindOf(diagram);
    // Every outside event says where it comes from; the timeout comes from the saga itself.
    expect(diagram.edges.filter((e) => kindOf(e) === 'external').every((e) => e.eventSource)).toBe(
      true,
    );
    expect(diagram.edges.filter((e) => kindOf(e) === 'timeout').map((e) => e.event)).toEqual([
      'PaymentTimeout',
    ]);
  });

  it('retries a failed payment (a guarded loop on the state) and gives up after three attempts', () => {
    const failed = diagram.edges.filter((e) => e.event === 'PaymentFailed');
    expect(failed.map((e) => [e.target, e.guard])).toEqual([
      ['end-2', 'attempts >= 3'],
      ['state-2', 'attempts < 3'],
    ]);
    expect(failed.find((e) => e.target === 'state-2')?.source).toBe('state-2');
  });

  it('ignores an event, schedules a timeout and has a colour', () => {
    expect(diagram.nodes.find((n) => n.id === 'state-3')).toMatchObject({
      color: 'teal',
      ignores: ['PaymentCharged'],
    });
    expect(diagram.nodes.find((n) => n.id === 'state-2')?.timers).toEqual([
      { action: 'schedule', name: 'PaymentTimeout', delay: '30s' },
    ]);
  });
});

describe('docs/examples/travel-booking.saga.yaml', () => {
  const { diagram, notes } = parseDiagramWithNotes(travelBooking);
  const nodes = diagram.nodes;
  const edges = diagram.edges;
  const kindOf = eventKindOf(diagram);

  it('is a valid, current-format diagram, written exactly as the editor would save it', () => {
    expect(notes).toEqual([]);
    expect(serializeDiagram(diagram)).toBe(travelBooking);
  });

  it('uses every node type and every field of a state', () => {
    expect(new Set(nodes.map((n) => n.type))).toEqual(
      new Set(['start', 'end', 'state', 'any', 'join']),
    );
    const states = nodes.filter((n) => n.type === 'state');
    for (const field of [
      'description',
      'color',
      'activities',
      'ignores',
      'requests',
      'timers',
      'retry',
      'timeout',
      'compensation',
    ] as const) {
      expect(
        states.some((n) => n[field] !== undefined),
        field,
      ).toBe(true);
    }
    expect(states.flatMap((n) => n.activities ?? []).map((a) => a.kind)).toEqual(
      expect.arrayContaining(['command', 'event']),
    );
    expect(
      states
        .flatMap((n) => n.timers ?? [])
        .map((t) => t.action)
        .sort(),
    ).toEqual(['schedule', 'unschedule']);
  });

  it('names and describes the saga', () => {
    expect(diagram.name).toBe('Travel booking');
    expect(diagram.description).toBeTruthy();
  });

  it('uses every kind of event: from the saga, from outside, timeout, reply, fault and composite', () => {
    const kinds = new Set(edges.map((e) => kindOf(e)));
    expect(kinds).toEqual(
      new Set(['internal', 'external', 'timeout', 'reply', 'fault', 'composite']),
    );
    // Events from outside say where they come from.
    expect(edges.filter((e) => kindOf(e) === 'external').every((e) => e.eventSource)).toBe(true);
  });

  it('has guards, parallel transitions, a self-transition and a loop', () => {
    expect(edges.some((e) => e.guard)).toBe(true);
    const pairs = edges.map((e) => `${e.source}>${e.target}`);
    expect(pairs.some((p, i) => pairs.indexOf(p) !== i)).toBe(true);
    expect(edges.some((e) => e.source === e.target)).toBe(true);
    // A loop that is not a self-transition: the transition back from "Confirming booking".
    const loops = [...backEdgeIds(diagram)].map((id) => edges.find((e) => e.id === id)!);
    expect(loops.some((e) => e.source !== e.target)).toBe(true);
  });

  it('has a compensation transition, the Any state with a transition, and a join with two events', () => {
    expect(edges.some((e) => e.kind === 'compensation')).toBe(true);
    expect(edges.filter((e) => e.source === 'any-1')).toHaveLength(1);
    expect(joinEventsOf(diagram).get('join-1')).toEqual([
      'CheckAvailability.Completed',
      'PaymentAuthorized',
    ]);
  });

  it('answers each request in all three ways', () => {
    for (const request of nodes.flatMap((n) => n.requests ?? [])) {
      for (const outcome of ['Completed', 'Faulted', 'TimeoutExpired']) {
        expect(
          edges.some((e) => e.event === `${request.name}.${outcome}`),
          `${request.name}.${outcome}`,
        ).toBe(true);
      }
    }
  });

  it('only schedules a timeout the saga also handles', () => {
    const scheduled = nodes
      .flatMap((n) => n.timers ?? [])
      .filter((t) => t.action === 'schedule')
      .map((t) => t.name);
    for (const name of scheduled) expect(edges.some((e) => e.event === name)).toBe(true);
  });
});
