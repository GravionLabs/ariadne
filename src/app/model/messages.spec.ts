import { Diagram, publishedEvents } from './diagram';
import { namingHint } from './messages';

describe('namingHint', () => {
  it.each(['SubmitOrder', 'ChargePayment', 'ReserveStock'])('accepts the command %s', (name) => {
    expect(namingHint('command', name)).toBeNull();
  });

  it.each(['OrderSubmitted', 'PaymentTaken', 'ParcelShown', 'LabelBuilt', 'EmailSent'])(
    'accepts the event %s',
    (name) => {
      expect(namingHint('event', name)).toBeNull();
    },
  );

  it('flags a past-tense command', () => {
    expect(namingHint('command', 'OrderSubmitted')).toMatch(/imperative/);
  });

  it('flags an event that is not past tense', () => {
    expect(namingHint('event', 'SubmitOrder')).toMatch(/past tense/);
  });

  it('says nothing about empty names', () => {
    expect(namingHint('event', '  ')).toBeNull();
  });
});

describe('publishedEvents', () => {
  const diagram = (nodes: Diagram['nodes']): Diagram => ({
    direction: 'top-bottom',
    nodes,
    edges: [],
  });

  it('collects the events states publish, not the commands they send', () => {
    expect([
      ...publishedEvents(
        diagram([
          { id: 'a', type: 'state', name: 'A' },
          {
            id: 'b',
            type: 'state',
            name: 'B',
            activities: [
              { kind: 'command', name: 'ReserveStock' },
              { kind: 'event', name: 'OrderAccepted' },
            ],
          },
          {
            id: 'c',
            type: 'end',
            name: 'C',
            activities: [{ kind: 'event', name: 'OrderShipped' }],
          },
        ]),
      ),
    ]).toEqual(['OrderAccepted', 'OrderShipped']);
  });

  it('is empty when no state publishes anything', () => {
    expect(publishedEvents(diagram([{ id: 'a', type: 'state', name: 'A' }])).size).toBe(0);
  });
});
