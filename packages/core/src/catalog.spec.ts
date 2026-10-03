import orderSaga from '../../../docs/examples/order.saga.yaml?raw';
import travelBooking from '../../../docs/examples/travel-booking.saga.yaml?raw';
import { describe, expect, it } from 'vitest';
import { buildCatalog, renameMessage } from './catalog';
import { Diagram } from './diagram';
import { parseDiagram } from './diagram-yaml';

const saga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'a',
      type: 'state',
      name: 'Reserving',
      activities: [
        { kind: 'command', name: 'ReserveStock' },
        { kind: 'event', name: 'StockRequested' },
      ],
    },
    {
      id: 'b',
      type: 'state',
      name: 'Shipping',
      activities: [{ kind: 'command', name: 'ReserveStock' }],
    },
    { id: 'end-1', type: 'end', name: 'Done' },
  ],
  edges: [
    {
      id: 'e1',
      source: 'start-1',
      target: 'a',
      kind: 'forward',
      event: 'OrderPlaced',
      eventSource: 'Shop',
    },
    { id: 'e2', source: 'a', target: 'b', kind: 'forward', event: 'StockRequested' },
    {
      id: 'e3',
      source: 'a',
      target: 'end-1',
      kind: 'forward',
      event: 'OrderPlaced',
      eventSource: 'Portal',
    },
  ],
};

describe('buildCatalog', () => {
  const catalog = buildCatalog(saga);
  const find = (kind: string, name: string) =>
    catalog.find((m) => m.kind === kind && m.name === name)!;

  it('lists commands first, then events, each by name', () => {
    expect(catalog.map((m) => `${m.kind}:${m.name}`)).toEqual([
      'command:ReserveStock',
      'event:OrderPlaced',
      'event:StockRequested',
    ]);
  });

  it('knows which states send a command, once each', () => {
    const reserve = find('command', 'ReserveStock');
    expect(reserve.producers.map((p) => p.name)).toEqual(['Reserving', 'Shipping']);
    expect(reserve.reactions).toEqual([]);
    expect(reserve.origin).toBeUndefined();
    expect(reserve.nodeIds).toEqual(['a', 'b']);
  });

  it('knows an event is internal, who publishes it and what reacts to it', () => {
    const requested = find('event', 'StockRequested');
    expect(requested.origin).toBe('internal');
    expect(requested.producers.map((p) => p.name)).toEqual(['Reserving']);
    expect(requested.reactions).toEqual([{ edgeId: 'e2', from: 'Reserving', to: 'Shipping' }]);
    expect(requested.nodeIds).toEqual(['a', 'b']);
    expect(requested.edgeIds).toEqual(['e2']);
  });

  it('knows an event is external, with every source and reaction', () => {
    const placed = find('event', 'OrderPlaced');
    expect(placed.origin).toBe('external');
    expect(placed.sources).toEqual(['Shop', 'Portal']);
    expect(placed.reactions.map((r) => r.edgeId)).toEqual(['e1', 'e3']);
    expect(placed.producers).toEqual([]);
    expect(placed.nodeIds).toEqual(['start-1', 'a', 'end-1']);
  });

  it('does not list a command and an event with the same name as one message', () => {
    const d: Diagram = {
      ...saga,
      nodes: saga.nodes.map((n) =>
        n.id === 'b' ? { ...n, activities: [{ kind: 'event' as const, name: 'ReserveStock' }] } : n,
      ),
    };
    expect(
      buildCatalog(d)
        .filter((m) => m.name === 'ReserveStock')
        .map((m) => m.kind),
    ).toEqual(['command', 'event']);
  });

  it('is empty for a diagram without messages', () => {
    expect(buildCatalog({ direction: 'top-bottom', nodes: [], edges: [] })).toEqual([]);
  });

  it('marks events with a fixed name as not renamable here', () => {
    const entries = buildCatalog(parseDiagram(travelBooking));
    const origins = new Map(entries.filter((m) => m.kind === 'event').map((m) => [m.name, m]));
    expect(origins.get('FlightHoldExpired')).toMatchObject({ origin: 'timeout', renamable: false });
    expect(origins.get('ValidateTraveller.Completed')).toMatchObject({
      origin: 'reply',
      renamable: false,
    });
    expect(origins.get('ValidateTraveller.Faulted')).toMatchObject({
      origin: 'fault',
      renamable: false,
    });
    expect(origins.get('BookingReady')).toMatchObject({ origin: 'composite', renamable: false });
    expect(origins.get('BookingConfirmed')).toMatchObject({ origin: 'internal', renamable: true });
    expect(origins.get('CancelRequested')).toMatchObject({ origin: 'external', renamable: true });
    expect(entries.filter((m) => m.kind === 'command').every((m) => m.renamable)).toBe(true);
  });

  it('lists the messages of the order example', () => {
    const names = buildCatalog(parseDiagram(orderSaga)).map((m) => m.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'ReserveStock',
        'ChargePayment',
        'ShipOrder',
        'OrderAccepted',
        'OrderReceived',
      ]),
    );
  });
});

describe('renameMessage', () => {
  it('renames a command in every state that sends it', () => {
    const next = renameMessage(saga, 'command', 'ReserveStock', 'HoldStock')!;
    expect(next.nodes.flatMap((n) => n.activities ?? []).map((a) => a.name)).toEqual([
      'HoldStock',
      'StockRequested',
      'HoldStock',
    ]);
    expect(next.edges).toEqual(saga.edges);
  });

  it('renames an event in the states that publish it and the transitions that react to it', () => {
    const next = renameMessage(saga, 'event', 'StockRequested', 'StockAsked')!;
    expect(next.nodes[1].activities?.[1]).toEqual({ kind: 'event', name: 'StockAsked' });
    expect(next.edges.map((e) => e.event)).toEqual(['OrderPlaced', 'StockAsked', 'OrderPlaced']);
  });

  it('renames an outside event that only transitions use, in all of them', () => {
    const next = renameMessage(saga, 'event', 'OrderPlaced', 'OrderReceived')!;
    expect(next.edges.map((e) => e.event)).toEqual([
      'OrderReceived',
      'StockRequested',
      'OrderReceived',
    ]);
  });

  it('leaves a command alone when an event of that name is renamed, and the other way round', () => {
    const both: Diagram = {
      ...saga,
      nodes: saga.nodes.map((n) =>
        n.id === 'b' ? { ...n, activities: [{ kind: 'event' as const, name: 'ReserveStock' }] } : n,
      ),
    };
    const next = renameMessage(both, 'event', 'ReserveStock', 'StockReserved')!;
    expect(next.nodes[1].activities?.[0]).toEqual({ kind: 'command', name: 'ReserveStock' });
    expect(next.nodes[2].activities?.[0]).toEqual({ kind: 'event', name: 'StockReserved' });
  });

  it('refuses an empty name, the same name, and a name another message already has', () => {
    expect(renameMessage(saga, 'command', 'ReserveStock', '  ')).toBeNull();
    expect(renameMessage(saga, 'command', 'ReserveStock', 'ReserveStock')).toBeNull();
    expect(renameMessage(saga, 'event', 'StockRequested', 'OrderPlaced')).toBeNull();
  });

  it('trims the new name and does not touch the input', () => {
    const before = JSON.stringify(saga);
    const next = renameMessage(saga, 'event', 'OrderPlaced', '  OrderCreated ')!;
    expect(next.edges[0].event).toBe('OrderCreated');
    expect(JSON.stringify(saga)).toBe(before);
  });

  it('renames what is known in code about an event with it', () => {
    const coded: Diagram = {
      ...saga,
      events: [
        { name: 'OrderPlaced', messageType: 'SubmitOrder' },
        { name: 'StockRequested', correlation: 'x => x.Id' },
      ],
    };
    const next = renameMessage(coded, 'event', 'OrderPlaced', 'OrderCreated')!;
    expect(next.events).toEqual([
      { name: 'OrderCreated', messageType: 'SubmitOrder' },
      { name: 'StockRequested', correlation: 'x => x.Id' },
    ]);
    // A command of that name is not the event.
    expect(renameMessage(coded, 'command', 'ReserveStock', 'HoldStock')!.events).toEqual(
      coded.events,
    );
  });
});
