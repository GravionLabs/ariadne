import { Diagram, eventKindOf } from './diagram';

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
});
