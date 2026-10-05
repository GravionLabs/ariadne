import { diagramToMarkdown } from './markdown';
import { Diagram } from '@ariadne/core';

const orderSaga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    { id: 'state-1', type: 'state', name: 'Awaiting order', description: 'Waits for the shop.' },
    {
      id: 'state-2',
      type: 'state',
      name: 'Reserving stock',
      activities: [{ kind: 'command', name: 'ReserveStock' }],
      compensation: { name: 'ReleaseStock', description: 'Gives the stock back' },
      retry: '3 attempts',
      timeout: '30s',
    },
    {
      id: 'state-3',
      type: 'state',
      name: 'Charging payment',
      activities: [
        { kind: 'command', name: 'ChargePayment' },
        { kind: 'event', name: 'PaymentRequested' },
      ],
    },
    { id: 'end-1', type: 'end', name: 'Completed' },
    { id: 'end-2', type: 'end', name: 'Cancelled' },
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
    { id: 'e4', source: 'state-3', target: 'end-1', kind: 'forward', event: 'PaymentCharged' },
    { id: 'e5', source: 'state-3', target: 'end-2', kind: 'forward', event: 'PaymentFailed' },
    { id: 'e6', source: 'state-3', target: 'state-2', kind: 'compensation', event: 'Undo' },
  ],
};

describe('diagramToMarkdown', () => {
  it('renders the order saga', () => {
    expect(
      diagramToMarkdown(orderSaga, {
        title: 'Order saga',
        description: 'Takes an order to shipping.',
      }),
    ).toMatchSnapshot();
  });

  it('is deterministic', () => {
    expect(diagramToMarkdown(orderSaga)).toBe(diagramToMarkdown(orderSaga));
  });

  it('has title, description, diagram and the four tables, in order', () => {
    const md = diagramToMarkdown(orderSaga, { title: 'Order', description: 'About orders.' });
    const headings = md.match(/^#{1,2} .*/gm);
    expect(headings).toEqual([
      '# Order',
      '## Diagram',
      '## States',
      '## Transitions',
      '## Commands',
      '## Events',
    ]);
    expect(md).toContain('# Order\n\nAbout orders.\n\n## Diagram');
    expect(md).toContain('```mermaid\nstateDiagram-v2\n');
  });

  it('gives the Mermaid diagram a text alternative, and every table a header row', () => {
    const md = diagramToMarkdown(orderSaga, { title: 'Order' });
    expect(md).toMatch(
      /```mermaid\nstateDiagram-v2\n {2}accTitle: Saga diagram\n {2}accDescr: \d+ states/,
    );
    // A table without a header row has no column names for a screen reader: each is followed by `| --- |`.
    const lines = md.split('\n');
    const separators = lines.filter((l) => /^\|( *:?-+:? *\|)+$/.test(l));
    expect(separators.length).toBeGreaterThanOrEqual(4);
    for (const [i, line] of lines.entries()) {
      if (/^\|( *:?-+:? *\|)+$/.test(line)) expect(lines[i - 1]).toMatch(/^\| .*\|$/);
    }
  });

  it('defaults the title and skips an empty description', () => {
    expect(diagramToMarkdown(orderSaga)).toMatch(/^# Saga\n\n## Diagram/);
    expect(diagramToMarkdown(orderSaga, { title: ' ', description: '  ' })).toMatch(
      /^# Saga\n\n## Diagram/,
    );
  });

  it('describes states, with decisions, activities, compensation, retry and timeout', () => {
    const md = diagramToMarkdown(orderSaga);
    expect(md).toContain('| Awaiting order | State | Waits for the shop. |');
    expect(md).toContain('| Charging payment | Decision |');
    expect(md).toContain('| Send ChargePayment<br>Publish PaymentRequested |');
    expect(md).toContain('| ReleaseStock: Gives the stock back | 3 attempts | 30s |');
    expect(md).toContain('| Initial | Initial |');
    expect(md).toContain('| Cancelled | Final |');
  });

  it('lists transitions with source and kind', () => {
    const md = diagramToMarkdown(orderSaga);
    expect(md).toContain(
      '| Awaiting order | OrderReceived | Shop API | Reserving stock | Forward |',
    );
    expect(md).toContain('| Charging payment | Undo | external | Reserving stock | Compensation |');
    expect(md).toContain('| Initial |  |  | Awaiting order | Forward |');
  });

  it('lists commands and where they are sent', () => {
    expect(diagramToMarkdown(orderSaga)).toContain('| ChargePayment | Charging payment |');
  });

  it('tells internal events from external ones and lists what they trigger', () => {
    const md = diagramToMarkdown({
      ...orderSaga,
      edges: [
        ...orderSaga.edges,
        {
          id: 'e7',
          source: 'state-1',
          target: 'end-2',
          kind: 'forward',
          event: 'PaymentRequested',
        },
      ],
    });
    expect(md).toContain(
      '| PaymentRequested | Internal | Charging payment | Awaiting order → Cancelled |',
    );
    expect(md).toContain('| OrderReceived | External |  | Awaiting order → Reserving stock |');
  });

  it('escapes pipes and line breaks in cells', () => {
    const md = diagramToMarkdown({
      direction: 'top-bottom',
      nodes: [{ id: 'a', type: 'state', name: 'A | B', description: 'one\ntwo' }],
      edges: [],
    });
    expect(md).toContain('| A \\| B | State | one<br>two |');
  });

  it('says so when there is nothing to list', () => {
    const md = diagramToMarkdown({ direction: 'top-bottom', nodes: [], edges: [] });
    expect(md.match(/_None\._/g)).toHaveLength(4);
  });

  it('ignores transitions to missing states', () => {
    const md = diagramToMarkdown({
      ...orderSaga,
      edges: [{ id: 'bad', source: 'nope', target: 'state-1', kind: 'forward', event: 'Ghost' }],
    });
    expect(md).not.toContain('Ghost');
  });

  it("prefers the diagram's own name and description over the fallbacks", () => {
    const md = diagramToMarkdown(
      { ...orderSaga, name: 'Order Saga', description: 'Takes an order to done.' },
      { title: 'order', description: 'Fallback' },
    );
    expect(md).toMatch(/^# Order Saga\n\nTakes an order to done\.\n\n## Diagram/);
    expect(md).not.toContain('Fallback');
  });

  it('falls back to the given title without a name', () => {
    expect(diagramToMarkdown(orderSaga, { title: 'order' })).toMatch(/^# order\n/);
  });

  it('adds a Guard column only when a transition has a guard', () => {
    expect(diagramToMarkdown(orderSaga)).not.toContain('| Guard |');
    const edges = orderSaga.edges.map((e) =>
      e.event === 'PaymentFailed' ? { ...e, guard: 'attempts >= 3' } : e,
    );
    const md = diagramToMarkdown({ ...orderSaga, edges });
    expect(md).toContain('| From | Event | Guard | Source | To | Kind |');
    expect(md).toContain('attempts >= 3');
  });

  it('adds an Ignores column only when a state ignores events, and names the any node', () => {
    expect(diagramToMarkdown(orderSaga)).not.toContain('| Ignores |');
    const nodes = [
      ...orderSaga.nodes.map((n) => (n.id === 'state-1' ? { ...n, ignores: ['Ping', 'Pong'] } : n)),
      { id: 'any-1', type: 'any' as const, name: 'Any state' },
    ];
    const md = diagramToMarkdown({ ...orderSaga, nodes });
    expect(md).toContain('| State | Type | Description | Activities | Ignores |');
    expect(md).toContain('Ping<br>Pong');
    expect(md).toMatch(/\| Any state \| Any state \|/);
  });

  it('adds a Timers column and calls the timeout event a timeout', () => {
    expect(diagramToMarkdown(orderSaga)).not.toContain('| Timers |');
    const nodes = orderSaga.nodes.map((n) =>
      n.id === 'state-2'
        ? { ...n, timers: [{ action: 'schedule' as const, name: 'StockTimeout', delay: '1h' }] }
        : n,
    );
    const edges = [
      ...orderSaga.edges,
      {
        id: 'e9',
        source: 'state-2',
        target: 'end-2',
        kind: 'forward' as const,
        event: 'StockTimeout',
      },
    ];
    const md = diagramToMarkdown({ ...orderSaga, nodes, edges });
    expect(md).toContain('Timers |');
    expect(md).toContain('Schedule StockTimeout in 1h');
    expect(md).toMatch(/\| StockTimeout \| timeout \|/);
    expect(md).toMatch(/\| StockTimeout \| Timeout \|/);
  });

  it('adds a Requests column and names the answers to a request', () => {
    expect(diagramToMarkdown(orderSaga)).not.toContain('| Requests |');
    const nodes = orderSaga.nodes.map((n) =>
      n.id === 'state-2' ? { ...n, requests: [{ name: 'CheckStock', timeout: '5s' }] } : n,
    );
    const edges = [
      ...orderSaga.edges,
      {
        id: 'e8',
        source: 'state-2',
        target: 'state-3',
        kind: 'forward' as const,
        event: 'CheckStock.Completed',
      },
      {
        id: 'e9',
        source: 'state-2',
        target: 'end-2',
        kind: 'forward' as const,
        event: 'CheckStock.Faulted',
      },
    ];
    const md = diagramToMarkdown({ ...orderSaga, nodes, edges });
    expect(md).toContain('Request CheckStock (timeout 5s)');
    expect(md).toMatch(/\| CheckStock\.Completed \| reply \|/);
    expect(md).toMatch(/\| CheckStock\.Faulted \| fault \|/);
    expect(md).toMatch(/\| CheckStock\.Completed \| Reply \|/);
    expect(md).toMatch(/\| CheckStock\.Faulted \| Fault \|/);
  });

  it('adds a Waits for column for a join and calls its event composite', () => {
    expect(diagramToMarkdown(orderSaga)).not.toContain('| Waits for |');
    const nodes = [...orderSaga.nodes, { id: 'join-1', type: 'join' as const, name: 'OrderReady' }];
    const edges = [
      ...orderSaga.edges,
      { id: 'j1', source: 'state-1', target: 'join-1', kind: 'forward' as const, event: 'A' },
      { id: 'j3', source: 'state-2', target: 'join-1', kind: 'forward' as const, event: 'B' },
      {
        id: 'j2',
        source: 'join-1',
        target: 'end-1',
        kind: 'forward' as const,
        event: 'OrderReady',
      },
    ];
    const md = diagramToMarkdown({ ...orderSaga, nodes, edges });
    expect(md).toContain('| Waits for |');
    expect(md).toContain('A<br>B');
    expect(md).toMatch(/\| OrderReady \| join \|/);
    expect(md).toMatch(/\| OrderReady \| Composite \|/);
  });
});

describe('diagramToMarkdown and routing slips', () => {
  it('names the slips of each state and gives each its itinerary and undo order', () => {
    const d: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'start', name: 'Initial' },
        {
          id: 'b',
          type: 'state',
          name: 'Fulfilling',
          routingSlips: [
            {
              name: 'Fulfil',
              activities: [
                { name: 'Reserve', compensates: true },
                { name: 'Charge', compensates: true },
                { name: 'Notify' },
              ],
            },
          ],
        },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', kind: 'forward', event: 'Placed' }],
    };
    const md = diagramToMarkdown(d);
    expect(md).toMatch(/\| State \|.*\| Routing slips \|/);
    expect(md).toContain(
      [
        '### Fulfil',
        '',
        'Started when the saga enters “Fulfilling”. It ends as Fulfil.Completed when every activity ran, or as Fulfil.Faulted when one faulted.',
        '',
        '1. Reserve (compensates)',
        '2. Charge (compensates)',
        '3. Notify',
        '',
        'On a fault, undone in this order: Charge → Reserve.',
      ].join('\n'),
    );
  });

  it('has no Routing slips column or section when no state starts one', () => {
    const md = diagramToMarkdown({
      direction: 'top-bottom',
      nodes: [{ id: 'a', type: 'start', name: 'I' }],
      edges: [],
    });
    expect(md).not.toContain('Routing slip');
  });
});
