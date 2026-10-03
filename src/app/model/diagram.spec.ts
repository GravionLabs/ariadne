import { Diagram, eventKindOf, joinEventsOf } from './diagram';

const diagram: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'state-1',
      type: 'state',
      name: 'Charging',
      activities: [{ kind: 'event', name: 'PaymentRequested' }],
      timers: [
        { action: 'schedule', name: 'PaymentTimeout', delay: '30s' },
        { action: 'unschedule', name: 'OtherTimeout' },
      ],
    },
  ],
  edges: [],
};

describe('eventKindOf', () => {
  const kindOf = eventKindOf(diagram);

  it('tells timeouts, events of the saga and outside events apart', () => {
    expect(kindOf({ event: 'PaymentTimeout' })).toBe('timeout');
    expect(kindOf({ event: 'PaymentRequested' })).toBe('internal');
    expect(kindOf({ event: 'OrderReceived' })).toBe('external');
  });

  it('has no kind without an event, and cancelling a timeout is not one', () => {
    expect(kindOf({})).toBeUndefined();
    expect(kindOf({ event: 'OtherTimeout' })).toBe('external');
  });

  describe('eventKindOf with requests', () => {
    const requesting: Diagram = {
      direction: 'top-bottom',
      nodes: [
        {
          id: 'state-1',
          type: 'state',
          name: 'Validating',
          requests: [{ name: 'ValidateAddress' }],
        },
      ],
      edges: [],
    };
    const kindOf = eventKindOf(requesting);

    it('tells the three answers to a request apart', () => {
      expect(kindOf({ event: 'ValidateAddress.Completed' })).toBe('reply');
      expect(kindOf({ event: 'ValidateAddress.Faulted' })).toBe('fault');
      expect(kindOf({ event: 'ValidateAddress.TimeoutExpired' })).toBe('timeout');
    });

    it('leaves other events, and answers to unknown requests, as external', () => {
      expect(kindOf({ event: 'ValidateAddress' })).toBe('external');
      expect(kindOf({ event: 'Other.Completed' })).toBe('external');
    });
  });

  describe('eventKindOf with joins', () => {
    const kindOf = eventKindOf({
      direction: 'top-bottom',
      nodes: [{ id: 'join-1', type: 'join', name: 'OrderReady' }],
      edges: [],
    });

    it('calls the event named like a join composite, and not the combined ones', () => {
      expect(kindOf({ event: 'OrderReady' })).toBe('composite');
      expect(kindOf({ event: 'A' })).toBe('external');
    });
  });
});

describe('joinEventsOf', () => {
  const edge = (id: string, source: string, target: string, event?: string) => ({
    id,
    source,
    target,
    kind: 'forward' as const,
    event,
  });
  const diagram: Diagram = {
    direction: 'top-bottom',
    nodes: [
      { id: 'a', type: 'state', name: 'A' },
      { id: 'b', type: 'state', name: 'B' },
      { id: 'join-1', type: 'join', name: 'Ready' },
      { id: 'join-2', type: 'join', name: 'Other' },
      { id: 'end-1', type: 'end', name: 'Done' },
    ],
    edges: [
      edge('e1', 'a', 'join-1', 'PaymentCharged'),
      edge('e2', 'b', 'join-1', 'StockReserved'),
      edge('e3', 'b', 'join-1', 'PaymentCharged'),
      edge('e4', 'a', 'join-1'),
      edge('e5', 'join-1', 'end-1', 'Ready'),
    ],
  };

  it('collects the events of the incoming transitions, each once, in transition order', () => {
    expect(joinEventsOf(diagram).get('join-1')).toEqual(['PaymentCharged', 'StockReserved']);
  });

  it('has an entry for every join, empty without incoming events, and none for other nodes', () => {
    const joins = joinEventsOf(diagram);
    expect([...joins.keys()]).toEqual(['join-1', 'join-2']);
    expect(joins.get('join-2')).toEqual([]);
  });

  it('does not count the transition leaving the join', () => {
    expect(joinEventsOf(diagram).get('join-1')).not.toContain('Ready');
  });
});
