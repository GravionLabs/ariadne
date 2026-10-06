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
    { id: 'join-1', type: 'join', name: 'AllArrived' },
  ],
});

describe('suggestEvents', () => {
  it('offers request outcomes, scheduled timeouts and join events', () => {
    expect(suggestEvents(diagram())).toEqual([
      'ChargeCard.Completed',
      'ChargeCard.Faulted',
      'ChargeCard.TimeoutExpired',
      'PaymentExpired',
      'AllArrived',
    ]);
  });
});
