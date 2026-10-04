import { Diagram } from '@ariadne/core';
import { describeDiagram, diagramAlternative, diagramTitle } from './describe';

const order: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    { id: 'state-1', type: 'state', name: 'Reserving stock' },
    { id: 'state-2', type: 'state', name: 'Charging payment' },
    { id: 'end-1', type: 'end', name: 'Completed' },
    { id: 'end-2', type: 'end', name: 'Cancelled' },
  ],
  edges: [
    { id: 'e1', source: 'start-1', target: 'state-1', kind: 'forward', event: 'OrderReceived' },
    { id: 'e2', source: 'state-1', target: 'state-2', kind: 'forward', event: 'StockReserved' },
    { id: 'e3', source: 'state-2', target: 'end-1', kind: 'forward', event: 'PaymentCharged' },
    { id: 'e4', source: 'state-2', target: 'end-2', kind: 'forward', event: 'PaymentFailed' },
    { id: 'e5', source: 'state-2', target: 'state-1', kind: 'compensation', event: 'Undo' },
  ],
};

describe('describeDiagram', () => {
  it('counts the states and transitions and names where the saga starts and ends', () => {
    expect(describeDiagram(order)).toBe(
      '5 states and 5 transitions, from Initial to Completed or Cancelled.',
    );
  });

  it('lists three ends with commas and an "or"', () => {
    const three: Diagram = {
      ...order,
      nodes: [...order.nodes, { id: 'end-3', type: 'end', name: 'Expired' }],
    };
    expect(describeDiagram(three)).toContain('to Completed, Cancelled or Expired.');
  });

  it('says "1 state" and "1 transition" in the singular, and counts neither a join nor the Any node', () => {
    const small: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'start-1', type: 'start', name: 'Initial' },
        { id: 'any-1', type: 'any', name: 'Any state' },
        { id: 'join-1', type: 'join', name: 'Both' },
      ],
      edges: [{ id: 'e1', source: 'any-1', target: 'join-1', kind: 'forward' }],
    };
    expect(describeDiagram(small)).toBe('1 state and 1 transition, from Initial.');
  });

  it('copes with an empty diagram, and one without a start or an end', () => {
    expect(describeDiagram({ direction: 'top-bottom', nodes: [], edges: [] })).toBe(
      '0 states and 0 transitions.',
    );
    expect(describeDiagram({ ...order, nodes: order.nodes.slice(1, 4) })).toBe(
      '3 states and 5 transitions, to Completed.',
    );
  });

  it('names a state once, however many are called the same', () => {
    const twice: Diagram = {
      ...order,
      nodes: [...order.nodes, { id: 'end-3', type: 'end', name: ' Completed ' }],
    };
    expect(describeDiagram(twice)).toContain('to Completed or Cancelled.');
  });
});

describe('diagramTitle', () => {
  it('is the name, or "Saga diagram"', () => {
    expect(diagramTitle({ ...order, name: ' Order Saga ' })).toBe('Order Saga');
    expect(diagramTitle(order)).toBe('Saga diagram');
    expect(diagramTitle({ ...order, name: '  ' })).toBe('Saga diagram');
  });
});

describe('diagramAlternative', () => {
  it('is the description and then the summary, on one line', () => {
    expect(diagramAlternative({ ...order, description: 'Takes an order\nto the door.' })).toBe(
      'Takes an order to the door. 5 states and 5 transitions, from Initial to Completed or Cancelled.',
    );
  });

  it('is the summary alone without a description', () => {
    expect(diagramAlternative(order)).toBe(describeDiagram(order));
  });
});
