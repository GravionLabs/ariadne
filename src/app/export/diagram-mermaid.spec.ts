import { Diagram } from '../model/diagram';
import { diagramToMermaid, mermaidMarkdown } from './diagram-mermaid';

const orderSaga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    { id: 'state-1', type: 'state', name: 'Awaiting order' },
    {
      id: 'state-2',
      type: 'state',
      name: 'Reserving stock',
      activities: [{ kind: 'command', name: 'ReserveStock' }],
      compensation: { name: 'ReleaseStock' },
    },
    {
      id: 'state-3',
      type: 'state',
      name: 'Charging payment',
      activities: [{ kind: 'command', name: 'ChargePayment' }],
    },
    {
      id: 'state-4',
      type: 'state',
      name: 'Shipping',
      activities: [
        { kind: 'command', name: 'ShipOrder' },
        { kind: 'event', name: 'OrderAccepted' },
      ],
    },
    {
      id: 'end-1',
      type: 'end',
      name: 'Cancelled',
    },
  ],
  edges: [
    { id: 'e1', source: 'start-1', target: 'state-1', kind: 'forward' },
    {
      id: 'e2',
      source: 'state-1',
      target: 'state-2',
      kind: 'forward',
      event: 'OrderReceived',
      eventSource: 'Shop API',
    },
    { id: 'e3', source: 'state-2', target: 'state-3', kind: 'forward', event: 'StockReserved' },
    { id: 'e4', source: 'state-3', target: 'state-4', kind: 'forward', event: 'PaymentCharged' },
    { id: 'e5', source: 'state-3', target: 'end-1', kind: 'forward', event: 'PaymentFailed' },
    { id: 'e6', source: 'state-3', target: 'state-2', kind: 'compensation', event: 'Undo' },
  ],
};

describe('diagramToMermaid', () => {
  it('renders the order saga', () => {
    expect(diagramToMermaid(orderSaga)).toMatchSnapshot();
  });

  it('maps the initial state to [*] and a final state to a named state leaving to [*]', () => {
    const out = diagramToMermaid(orderSaga);
    expect(out).toContain('[*] --> Awaiting_order');
    expect(out).toContain('Charging_payment --> Cancelled : PaymentFailed');
    expect(out).toContain('Cancelled --> [*]');
  });

  it('labels transitions Event / Send A, Publish B and marks external events', () => {
    const out = diagramToMermaid(orderSaga);
    expect(out).toContain(
      'Awaiting_order --> Reserving_stock : OrderReceived (from Shop API) / Send ReserveStock',
    );
    expect(out).toContain(
      'Charging_payment --> Shipping : PaymentCharged / Send ShipOrder, Publish OrderAccepted',
    );
  });

  it('declares display names for sanitised ids and keeps plain names as they are', () => {
    const out = diagramToMermaid(orderSaga);
    expect(out).toContain('state "Awaiting order" as Awaiting_order');
    expect(out).not.toContain('as Shipping');
  });

  it('distinguishes compensation transitions and compensated states', () => {
    const out = diagramToMermaid(orderSaga);
    expect(out).toContain('Charging_payment --> Reserving_stock : compensate: Undo');
    expect(out).toContain('class Reserving_stock compensation');
    expect(out).toContain('classDef compensation');
  });

  it('follows the diagram direction', () => {
    expect(diagramToMermaid(orderSaga)).toContain('direction TB');
    expect(diagramToMermaid({ ...orderSaga, direction: 'left-right' })).toContain('direction LR');
  });

  it('makes ids unique, valid and not keywords', () => {
    const out = diagramToMermaid({
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'state', name: 'Same' },
        { id: 'b', type: 'state', name: 'same' },
        { id: 'c', type: 'state', name: 'end' },
        { id: 'd', type: 'state', name: '1st step!' },
        { id: 'e', type: 'state', name: '???' },
      ],
      edges: [{ id: 'x', source: 'a', target: 'b', kind: 'forward' }],
    });
    expect(out).toContain('state "same" as same_2');
    expect(out).toContain('state "end" as s_end');
    expect(out).toContain('state "1st step!" as s_1st_step');
    expect(out).toContain('state "???" as s_state');
    expect(out).toContain('Same --> same_2\n');
  });

  it('escapes characters that would end a label or name', () => {
    const out = diagramToMermaid({
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'state', name: 'Say "hi"; ok' },
        { id: 'b', type: 'state', name: 'B', activities: [{ kind: 'command', name: 'X;Y' }] },
      ],
      edges: [{ id: 'x', source: 'a', target: 'b', kind: 'forward', event: 'Multi\nline' }],
    });
    expect(out).toContain('state "Say #quot;hi#quot;#59; ok" as Say_hi_ok');
    expect(out).toContain(': Multi line / Send X#59;Y');
  });

  it('labels a transition without an event by its activities only, or leaves it bare', () => {
    const out = diagramToMermaid({
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'state', name: 'A' },
        { id: 'b', type: 'state', name: 'B', activities: [{ kind: 'event', name: 'Done' }] },
      ],
      edges: [
        { id: 'x', source: 'a', target: 'b', kind: 'forward' },
        { id: 'y', source: 'b', target: 'a', kind: 'forward' },
      ],
    });
    expect(out).toContain('A --> B : Publish Done\n');
    expect(out).toContain('B --> A\n');
  });

  it('skips transitions to missing states and handles an empty diagram', () => {
    expect(
      diagramToMermaid({
        ...orderSaga,
        edges: [{ id: 'bad', source: 'nope', target: 'state-1', kind: 'forward' }],
      }),
    ).not.toContain('nope');
    expect(diagramToMermaid({ direction: 'top-bottom', nodes: [], edges: [] })).toBe(
      'stateDiagram-v2\n  direction TB\n',
    );
  });
});

describe('mermaidMarkdown', () => {
  it('wraps the text in a mermaid fence', () => {
    expect(mermaidMarkdown('stateDiagram-v2\n')).toBe('```mermaid\nstateDiagram-v2\n```\n');
  });
});

describe('diagramToMermaid title', () => {
  it('starts with title front matter for a named diagram', () => {
    const text = diagramToMermaid({ ...orderSaga, name: 'Order "Saga"' });
    expect(text.startsWith('---\ntitle: "Order \\"Saga\\""\n---\nstateDiagram-v2\n')).toBe(true);
  });

  it('has no front matter without a name', () => {
    expect(diagramToMermaid(orderSaga).startsWith('stateDiagram-v2\n')).toBe(true);
    expect(diagramToMermaid({ ...orderSaga, name: '  ' }).startsWith('stateDiagram-v2\n')).toBe(
      true,
    );
  });

  it('shows a guard in square brackets after the event', () => {
    const edges = orderSaga.edges.map((e) =>
      e.event === 'PaymentFailed' ? { ...e, guard: 'attempts >= 3' } : e,
    );
    expect(diagramToMermaid({ ...orderSaga, edges })).toContain(
      'Charging_payment --> Cancelled : PaymentFailed [attempts >= 3]',
    );
  });

  it('notes the events a state ignores', () => {
    const nodes = orderSaga.nodes.map((n) =>
      n.name === 'Shipping' ? { ...n, ignores: ['OrderCancelled', 'Ping'] } : n,
    );
    expect(diagramToMermaid({ ...orderSaga, nodes })).toContain(
      'note right of Shipping : Ignores OrderCancelled, Ping',
    );
  });

  it('notes the timers of a state', () => {
    const nodes = orderSaga.nodes.map((n) =>
      n.name === 'Shipping'
        ? {
            ...n,
            timers: [
              { action: 'schedule' as const, name: 'ShipTimeout', delay: '2d' },
              { action: 'unschedule' as const, name: 'PayTimeout' },
            ],
          }
        : n,
    );
    expect(diagramToMermaid({ ...orderSaga, nodes })).toContain(
      'note right of Shipping : Schedules ShipTimeout in 2d · Unschedules PayTimeout',
    );
  });

  it('notes the requests of a state', () => {
    const nodes = orderSaga.nodes.map((n) =>
      n.name === 'Shipping'
        ? { ...n, requests: [{ name: 'BookCourier', timeout: '10s' }, { name: 'CheckFraud' }] }
        : n,
    );
    expect(diagramToMermaid({ ...orderSaga, nodes })).toContain(
      'note right of Shipping : Requests BookCourier (timeout 10s) · Requests CheckFraud',
    );
  });

  it('draws a join as a Mermaid bar, with a note for its name and the events it waits for', () => {
    const nodes = [
      ...orderSaga.nodes,
      { id: 'join-1', type: 'join' as const, name: 'Order ready' },
    ];
    const edges = [
      ...orderSaga.edges,
      {
        id: 'j1',
        source: 'state-1',
        target: 'join-1',
        kind: 'forward' as const,
        event: 'PaymentCharged',
      },
      {
        id: 'j3',
        source: 'state-2',
        target: 'join-1',
        kind: 'forward' as const,
        event: 'StockReserved',
      },
      {
        id: 'j2',
        source: 'join-1',
        target: 'end-1',
        kind: 'forward' as const,
        event: 'Order ready',
      },
    ];
    const out = diagramToMermaid({ ...orderSaga, nodes, edges });
    expect(out).toContain('state Order_ready <<join>>');
    expect(out).toContain(
      'note right of Order_ready : Order ready when PaymentCharged + StockReserved have all arrived',
    );
    expect(out).not.toContain('state "Order ready" as Order_ready');
  });
});
