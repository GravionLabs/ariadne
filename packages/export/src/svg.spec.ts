import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fit, renderDiagramSvg, COLORS } from './svg';
import { Diagram } from '@ariadne/core';
import { contrastFailures, type ContrastPair } from '@ariadne/core/testing';

/** The order saga: external trigger, activities, a decision, a compensation and a final state. */
const orderSaga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'state-1',
      type: 'state',
      name: 'Reserving stock',
      activities: [{ kind: 'command', name: 'ReserveStock' }],
      compensation: { name: 'ReleaseStock' },
    },
    {
      id: 'state-2',
      type: 'state',
      name: 'Charging payment',
      color: 'orange',
      activities: [
        { kind: 'command', name: 'ChargePayment' },
        { kind: 'event', name: 'PaymentRequested' },
      ],
    },
    { id: 'end-1', type: 'end', name: 'Completed' },
    { id: 'end-2', type: 'end', name: 'Cancelled' },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'start-1',
      target: 'state-1',
      kind: 'forward',
      event: 'OrderSubmitted',
      eventSource: 'Shop API',
    },
    { id: 'edge-2', source: 'state-1', target: 'state-2', kind: 'forward', event: 'StockReserved' },
    { id: 'edge-3', source: 'state-2', target: 'end-1', kind: 'forward', event: 'PaymentCharged' },
    { id: 'edge-4', source: 'state-2', target: 'end-2', kind: 'forward', event: 'PaymentFailed' },
    { id: 'edge-5', source: 'state-2', target: 'state-1', kind: 'compensation', event: 'Undo' },
  ],
};

describe('renderDiagramSvg', () => {
  it('renders the order saga', () => {
    expect(renderDiagramSvg(orderSaga).svg).toMatchSnapshot();
  });

  it('is deterministic', () => {
    expect(renderDiagramSvg(orderSaga).svg).toBe(renderDiagramSvg(orderSaga).svg);
  });

  it('draws states, arrowheads, labels and a dashed compensation, without editor chrome', () => {
    const { svg } = renderDiagramSvg(orderSaga);
    for (const name of ['Reserving stock', 'Charging payment', 'Completed', 'Cancelled']) {
      expect(svg).toContain(name);
    }
    expect(svg).toContain('⚡');
    expect(svg).toContain('from Shop API');
    expect(svg).toContain('Send');
    expect(svg).toContain('Publish');
    expect(svg.match(/marker-end="url\(#arrow-forward\)"/g)).toHaveLength(4);
    expect(svg.match(/stroke-dasharray="6 4"/g)).toHaveLength(1);
    expect(svg).not.toContain('slot');
  });

  it('writes plain colours: no CSS variables and no color-mix', () => {
    const { svg } = renderDiagramSvg(orderSaga);
    expect(svg).not.toMatch(/var\(|color-mix/);
    expect(svg).toContain('#f76906'); // palette colour of "Charging payment"
  });

  it('shows a state that several transitions leave as a decision', () => {
    expect(renderDiagramSvg(orderSaga).svg).toContain('DECISION');
  });

  it('sizes the viewBox to the content', () => {
    const { svg, width, height } = renderDiagramSvg(orderSaga);
    expect(svg).toContain(`width="${width}" height="${height}"`);
    expect(width).toBeGreaterThan(260);
    expect(height).toBeGreaterThan(300);
  });

  it('lays out left-right too', () => {
    const lr = renderDiagramSvg({ ...orderSaga, direction: 'left-right' });
    const tb = renderDiagramSvg(orderSaga);
    expect(lr.width).toBeGreaterThan(tb.width);
  });

  it('renders an empty diagram without throwing', () => {
    expect(() => renderDiagramSvg({ direction: 'top-bottom', nodes: [], edges: [] })).not.toThrow();
  });

  it('escapes markup in names and truncates long ones', () => {
    const { svg } = renderDiagramSvg({
      direction: 'top-bottom',
      nodes: [{ id: 'a', type: 'state', name: `A <b> & "c" ${'x'.repeat(80)}` }],
      edges: [],
    });
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('…');
    expect(svg).not.toContain('x'.repeat(80));
  });

  it('ignores transitions to missing states', () => {
    const svg = renderDiagramSvg({
      ...orderSaga,
      edges: [{ id: 'bad', source: 'nope', target: 'state-1', kind: 'forward' }],
    }).svg;
    expect(svg).not.toContain('marker-end');
  });
});

describe('renderDiagramSvg options', () => {
  it('is unchanged without options', () => {
    expect(renderDiagramSvg(orderSaga, {}).svg).toBe(renderDiagramSvg(orderSaga).svg);
    expect(renderDiagramSvg(orderSaga).svg).not.toContain('data-');
  });

  it('groups every state and transition with stable attributes, labels with their transition', () => {
    const { svg } = renderDiagramSvg(orderSaga, { addressable: true });
    for (const n of orderSaga.nodes) {
      expect(svg).toContain(`<g data-node-id="${n.id}" data-kind="${n.type}">`);
    }
    // each transition: its line and its label (edge-5 has an event too)
    for (const e of orderSaga.edges) {
      expect(
        svg.match(
          new RegExp(`data-edge-id="${e.id}" data-kind="${e.kind}" data-part="(line|label)"`, 'g'),
        ),
      ).toHaveLength(2);
    }
    expect(svg).toContain('data-edge-id="edge-5" data-kind="compensation"');
    // the label sits inside its transition's group
    expect(svg).toMatch(/data-edge-id="edge-1"[^>]*><g><rect[^>]*\/>.*OrderSubmitted/s);
  });

  it('prefixes the ids of the arrow markers and their references', () => {
    const { svg } = renderDiagramSvg(orderSaga, { idPrefix: 'a1-' });
    expect(svg).toContain('<marker id="a1-arrow-forward"');
    expect(svg).toContain('<marker id="a1-arrow-compensation"');
    expect(svg).toContain('marker-end="url(#a1-arrow-forward)"');
    expect(svg).not.toMatch(/id="arrow-|url\(#arrow-/);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes colours as custom properties with today's values as fallbacks", () => {
    const plain = renderDiagramSvg(orderSaga).svg;
    const themed = renderDiagramSvg(orderSaga, { cssVariables: true }).svg;
    expect(themed).toContain('var(--ariadne-surface, #ffffff)');
    expect(themed).toContain('var(--ariadne-text-subtle, #676c81)');
    expect(themed).toContain('var(--ariadne-palette-orange, #f76906)');
    expect(themed).toContain(
      'color-mix(in srgb, var(--ariadne-external, #0d9488) 75%, var(--ariadne-text, #1a1c23))',
    );
    // dropping the variables gives back the plain output
    const flattened = themed.replace(/var\(--ariadne-[a-z-]+, (#[0-9a-f]{6})\)/g, '$1');
    expect(flattened).not.toContain('var(');
    expect(plain).not.toMatch(/var\(|color-mix/);
  });

  it('keeps custom colours of a state and resets the colours after a themed render', () => {
    const custom = {
      ...orderSaga,
      nodes: orderSaga.nodes.map((n) => ({
        ...n,
        color: n.id === 'state-1' ? ('#123456' as const) : n.color,
      })),
    };
    expect(renderDiagramSvg(custom, { cssVariables: true }).svg).toContain('#123456');
    expect(renderDiagramSvg(orderSaga).svg).not.toContain('var(');
  });
});

describe('fit', () => {
  it('keeps text that fits and truncates the rest with an ellipsis', () => {
    expect(fit('short', 200, 12)).toBe('short');
    const cut = fit('a very long state name indeed', 60, 12);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(15);
  });
});

describe('renderDiagramSvg text alternative', () => {
  it('labels the picture with a title and a description, by id', () => {
    const { svg } = renderDiagramSvg({ ...orderSaga, name: 'Order Saga' });
    expect(svg).toMatch(/<svg [^>]*role="img" aria-labelledby="title desc"/);
    expect(svg).toContain('<title id="title">Order Saga</title>');
    expect(svg).toMatch(
      /<desc id="desc">\d+ states and \d+ transitions, from Initial to Completed( or [^<]+)?\.<\/desc>/,
    );
  });

  it('puts the description before the summary, and escapes both', () => {
    const { svg } = renderDiagramSvg({
      ...orderSaga,
      name: 'Order & Co',
      description: 'Takes <orders>',
    });
    expect(svg).toContain('<title id="title">Order &amp; Co</title>');
    expect(svg).toContain('<desc id="desc">Takes &lt;orders&gt; ');
  });

  it('always has a title and a description, also without a name', () => {
    const { svg } = renderDiagramSvg(orderSaga);
    expect(svg).toContain('<title id="title">Saga diagram</title>');
    expect(svg).toMatch(/<desc id="desc">\d+ states and \d+ transitions/);
  });

  it('uses the id prefix, so that several pictures on a page do not share ids', () => {
    const { svg } = renderDiagramSvg(orderSaga, { idPrefix: 'order-' });
    expect(svg).toContain('aria-labelledby="order-title order-desc"');
    expect(svg).toContain('<title id="order-title">');
    expect(svg).toContain('<desc id="order-desc">');
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('renderDiagramSvg', () => {
  it('shows a guard after the event in the label', () => {
    const edges = orderSaga.edges.map((e) =>
      e.event === 'PaymentFailed' ? { ...e, guard: 'attempts >= 3' } : e,
    );
    const { svg } = renderDiagramSvg({ ...orderSaga, edges });
    expect(svg).toContain('PaymentFailed [attempts &gt;= 3]');
  });

  it('draws ignored events struck through and the any node dashed', () => {
    const nodes = [
      ...orderSaga.nodes.map((n) => (n.id === 'state-1' ? { ...n, ignores: ['Ping'] } : n)),
      { id: 'any-1', type: 'any' as const, name: 'Any state' },
    ];
    const { svg } = renderDiagramSvg({
      ...orderSaga,
      nodes,
      edges: [
        ...orderSaga.edges,
        {
          id: 'edge-9',
          source: 'any-1',
          target: 'end-2',
          kind: 'forward' as const,
          event: 'Abort',
        },
      ],
    });
    expect(svg).toMatch(/text-decoration="line-through"[^>]*>Ping</);
    expect(svg).toContain('stroke-dasharray="5 4"');
    expect(svg).toContain('Any state');
  });

  it('draws a timeout firing as a dotted amber line with a clock, and the timer chip', () => {
    const nodes = orderSaga.nodes.map((n) =>
      n.id === 'state-1'
        ? { ...n, timers: [{ action: 'schedule' as const, name: 'StockTimeout', delay: '1h' }] }
        : n,
    );
    const edges = orderSaga.edges.map((e) =>
      e.id === 'edge-2' ? { ...e, event: 'StockTimeout' } : e,
    );
    const { svg } = renderDiagramSvg({ ...orderSaga, nodes, edges });
    expect(svg).toContain('stroke="#d97706" stroke-width="2" stroke-dasharray="2 5"');
    expect(svg).toContain('◷');
    expect(svg).toContain('Schedule</tspan> StockTimeout in 1h');
  });

  it('draws the request chip and marks replies and faults', () => {
    const nodes = orderSaga.nodes.map((n) =>
      n.id === 'state-1' ? { ...n, requests: [{ name: 'CheckStock', timeout: '5s' }] } : n,
    );
    const edges = orderSaga.edges.map((e) =>
      e.id === 'edge-2'
        ? { ...e, event: 'CheckStock.Completed' }
        : e.id === 'edge-3'
          ? { ...e, event: 'CheckStock.Faulted' }
          : e,
    );
    const { svg } = renderDiagramSvg({ ...orderSaga, nodes, edges });
    expect(svg).toContain('Request</tspan> CheckStock · 5s');
    expect(svg).toContain('↩');
    expect(svg).toContain('⚠');
  });

  it('draws a join as a bar with its name and the events of its incoming transitions', () => {
    const nodes = [...orderSaga.nodes, { id: 'join-1', type: 'join' as const, name: 'OrderReady' }];
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
        event: 'OrderReady',
      },
    ];
    const { svg } = renderDiagramSvg({ ...orderSaga, nodes, edges });
    expect(svg).toContain('height="10" rx="5" fill="#4f46e5"');
    expect(svg).toContain('>OrderReady<');
    expect(svg).toContain('PaymentCharged + StockReserved');
    expect(svg).toContain('▬');
  });

  it('routes a transition that closes a loop around the states, with its label', () => {
    const looped = {
      ...orderSaga,
      edges: [
        ...orderSaga.edges,
        {
          id: 'edge-9',
          source: 'state-2',
          target: 'state-1',
          kind: 'forward' as const,
          event: 'RetryReserve',
        },
      ],
    };
    const { svg } = renderDiagramSvg(looped);
    expect(svg).toContain('RetryReserve');
    // The loop is a path of its own going out to a lane: more bends than a straight transition.
    const paths = svg.match(/<path d="M[^"]*" fill="none"/g) ?? [];
    const plain = renderDiagramSvg(orderSaga).svg.match(/<path d="M[^"]*" fill="none"/g) ?? [];
    expect(paths).toHaveLength(plain.length + 1);
    expect(renderDiagramSvg(looped).svg).toBe(svg);
  });

  it('draws parallel transitions as separate lines, each through its label', () => {
    const parallel = {
      ...orderSaga,
      edges: [
        ...orderSaga.edges,
        {
          id: 'edge-8',
          source: 'state-1',
          target: 'state-2',
          kind: 'forward' as const,
          event: 'StockReserved',
          guard: 'express',
        },
      ],
    };
    const { svg } = renderDiagramSvg(parallel);
    expect(svg).toContain('StockReserved [express]');
    const plain = renderDiagramSvg(orderSaga).svg;
    const count = (s: string) => (s.match(/<path d="M[^"]*" fill="none"/g) ?? []).length;
    expect(count(svg)).toBe(count(plain) + 1);
    // The two lines between the same states do not coincide.
    const between = svg.match(/<path d="M[^"]*" fill="none"/g)!;
    expect(new Set(between).size).toBe(between.length);
  });

  it('draws a transition from a state to itself', () => {
    const { svg } = renderDiagramSvg({
      ...orderSaga,
      edges: [
        ...orderSaga.edges,
        {
          id: 'edge-9',
          source: 'state-2',
          target: 'state-2',
          kind: 'forward' as const,
          event: 'RetryCharge',
        },
      ],
    });
    expect(svg).toContain('RetryCharge');
  });
});

describe('the symbols of the SVG', () => {
  it('are all in the font the PNG export draws with', () => {
    // The CLI and the VS Code extension draw PNGs with DejaVu Sans Condensed only. A symbol outside
    // it is drawn as an empty box (the stopwatch ⏱ was). Add a symbol here only after checking that
    // the font has it (U+2026 … U+2709 below are all in DejaVuSansCondensed.ttf, regular and bold;
    // ⇢ U+21E2 and ↶ U+21B6, the routing slip outcomes, checked with fontTools).
    const inFont = ['…', '↗', '↩', '↶', '↺', '⇢', '⊘', '◷', '▬', '⚑', '⚠', '⚡', '✉'];
    const source = readFileSync(join(import.meta.dirname, 'svg.ts'), 'utf8');
    const used = [...new Set([...source].filter((c) => c.codePointAt(0)! > 0x2000))];
    expect(used.sort()).toEqual([...inFont].sort());
  });
});

describe('the colours of the SVG (WCAG 2.2 AA)', () => {
  // Plain hex, because an exported file has no CSS variables: the light theme of the editor. The
  // pairs are those of the editor's themes: text 4.5:1 (1.4.3), the line and the accents 3:1 (1.4.11).
  const { palette, ...plain } = COLORS;
  const tokens: Record<string, string> = {
    ...plain,
    ...Object.fromEntries(
      Object.entries(palette).map(([name, value]) => [`palette.${name}`, value]),
    ),
  };
  const accents = Object.keys(tokens).filter(
    (name) => !['surface', 'border', 'line', 'text', 'textSubtle'].includes(name),
  );
  const pairs: ContrastPair[] = [
    ['text', 'surface', 4.5],
    ['textSubtle', 'surface', 4.5],
    ['line', 'surface', 3],
    ...accents.map((name): ContrastPair => [name, 'surface', 3]),
  ];

  /** Pairs that are allowed to fail: none. A pair that fails is fixed, not listed. */
  const KNOWN_FAILURES: string[] = [];

  it('has the pairs that are not enough, and no others', () => {
    expect(contrastFailures('svg', tokens, pairs).sort()).toEqual([...KNOWN_FAILURES].sort());
  });

  it('checks every colour of the palette', () => {
    // A new colour has to be put in a pair, or listed as not needing one here.
    expect(
      Object.keys(tokens)
        .filter((n) => n !== 'border')
        .sort(),
    ).toEqual(['surface', 'line', 'text', 'textSubtle', ...accents].sort());
  });
});

describe('renderDiagramSvg in every direction (#113)', () => {
  const two: Diagram = {
    direction: 'top-bottom',
    nodes: [
      { id: 'a', type: 'start', name: 'Initial' },
      { id: 'b', type: 'state', name: 'Working' },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b', kind: 'forward', event: 'Go' }],
  };
  /** The first and the last point of the transition's path, and the boxes of its two states. */
  const geometry = (direction: Diagram['direction']) => {
    const { svg } = renderDiagramSvg({ ...two, direction }, { addressable: true });
    const d = /data-edge-id="e"[^>]*data-part="line"><path d="([^"]+)"/.exec(svg)![1];
    const numbers = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const first = { x: numbers[0], y: numbers[1] };
    const last = { x: numbers.at(-2)!, y: numbers.at(-1)! };
    const box = (id: string) => {
      const m = new RegExp(
        `data-node-id="${id}"[^>]*><g><rect x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"`,
      ).exec(svg)!;
      const [x, y, w, h] = m.slice(1).map(Number);
      return { x, y, w, h };
    };
    return { first, last, a: box('a'), b: box('b') };
  };

  it.each(['top-bottom', 'bottom-top', 'left-right', 'right-left'] as const)(
    'leaves the state on its downstream side and enters the next on its upstream side (%s)',
    (direction) => {
      const { first, last, a, b } = geometry(direction);
      const near = (p: number, q: number) => Math.abs(p - q) < 1.5;
      const ok = {
        'top-bottom': near(first.y, a.y + a.h) && near(last.y, b.y),
        'bottom-top': near(first.y, a.y) && near(last.y, b.y + b.h),
        'left-right': near(first.x, a.x + a.w) && near(last.x, b.x),
        'right-left': near(first.x, a.x) && near(last.x, b.x + b.w),
      }[direction];
      expect(ok, JSON.stringify({ first, last, a, b })).toBe(true);
    },
  );
});

describe('routing slips in the SVG (ADR 0023)', () => {
  const slipped: Diagram = {
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
            activities: [{ name: 'Reserve', compensates: true }, { name: 'Notify' }],
          },
        ],
      },
      { id: 'c', type: 'end', name: 'Done' },
      { id: 'd', type: 'end', name: 'Failed' },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b', kind: 'forward', event: 'Placed' },
      { id: 'e2', source: 'b', target: 'c', kind: 'forward', event: 'Fulfil.Completed' },
      { id: 'e3', source: 'b', target: 'd', kind: 'forward', event: 'Fulfil.Faulted' },
    ],
  };

  it('shows the slip on its state, and its outcomes with their own symbols and colours', () => {
    const { svg } = renderDiagramSvg(slipped);
    expect(svg).toContain('<tspan fill="#676c81">Routing slip</tspan> Fulfil · 2 steps');
    expect(svg).toMatch(/fill="#059669"[^>]*>⇢<\/text>/);
    expect(svg).toMatch(/fill="#dc2626"[^>]*>↶<\/text>/);
  });
});
