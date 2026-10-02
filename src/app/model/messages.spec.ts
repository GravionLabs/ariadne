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
  it('collects the events transitions publish, not the ones they send or react to', () => {
    const diagram: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'state', name: 'A' },
        { id: 'b', type: 'state', name: 'B' },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'forward',
          event: 'OrderReceived',
          activities: [
            { kind: 'command', name: 'ReserveStock' },
            { kind: 'event', name: 'OrderAccepted' },
          ],
        },
        { id: 'e2', source: 'b', target: 'a', kind: 'forward', event: 'OrderAccepted' },
      ],
    };
    expect([...publishedEvents(diagram)]).toEqual(['OrderAccepted']);
  });
});
