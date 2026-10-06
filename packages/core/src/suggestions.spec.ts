import { describe, expect, it } from 'vitest';
import { Diagram, emptyDiagram } from './diagram';
import { suggestEvents } from './suggestions';

const diagram = (): Diagram => ({
  ...emptyDiagram(),
  nodes: [
    {
      id: 'state-1',
      type: 'state',
      name: 'Charging',
      requests: [{ name: 'ChargeCard' }],
      timers: [{ name: 'PaymentExpired', action: 'schedule' }],
    },
    {
      id: 'state-2',
      type: 'state',
      name: 'Shipping',
      routingSlips: [{ name: 'Ship', activities: [{ name: 'Pack' }] }],
      activities: [
        { kind: 'event', name: 'OrderShipped' },
        { kind: 'command', name: 'PrintLabel' },
      ],
    },
    { id: 'join-1', type: 'join', name: 'AllArrived' },
  ],
});

describe('suggestEvents', () => {
  it('offers outcomes, scheduled timeouts, join events and published events', () => {
    expect(suggestEvents(diagram())).toEqual([
      'ChargeCard.Completed',
      'ChargeCard.Faulted',
      'ChargeCard.TimeoutExpired',
      'PaymentExpired',
      'Ship.Completed',
      'Ship.Faulted',
      'AllArrived',
      'OrderShipped',
    ]);
  });

  it('adds the events of other transitions and of the diagram, once each', () => {
    const d = diagram();
    d.edges = [
      { id: 'edge-1', source: 'state-1', target: 'state-2', kind: 'forward', event: 'OrderPaid' },
      { id: 'edge-2', source: 'state-2', target: 'join-1', kind: 'forward', event: 'OrderPaid' },
    ];
    d.events = [{ name: 'OrderPaid' }, { name: 'OrderCancelled', messageType: 'Cancel' }];
    const events = suggestEvents(d);
    expect(events.filter((e) => e === 'OrderPaid')).toHaveLength(1);
    expect(events.slice(-2)).toEqual(['OrderPaid', 'OrderCancelled']);
  });

  it('puts what the source state makes possible first', () => {
    const events = suggestEvents(diagram(), { from: 'state-2' });
    expect(events.slice(0, 2)).toEqual(['Ship.Completed', 'Ship.Faulted']);
    expect(events).toContain('ChargeCard.Completed');
  });

  it('leaves out an event another transition leaving the same state already reacts to', () => {
    const d = diagram();
    d.edges = [
      {
        id: 'edge-1',
        source: 'state-1',
        target: 'state-2',
        kind: 'forward',
        event: 'PaymentExpired',
      },
      { id: 'edge-2', source: 'state-2', target: 'join-1', kind: 'forward', event: 'OrderShipped' },
    ];
    const events = suggestEvents(d, { from: 'state-1' });
    expect(events).not.toContain('PaymentExpired');
    // Used elsewhere, not from this state: still offered.
    expect(events).toContain('OrderShipped');
    // The edge being edited does not count against itself.
    expect(suggestEvents(d, { from: 'state-1', edge: 'edge-1' })).toContain('PaymentExpired');
  });
});
