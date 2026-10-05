import { Diagram, DiagramNode } from './diagram';
import {
  backEdgeIds,
  decisionIds,
  isCompact,
  labelCard,
  labelSize,
  layoutDiagram,
  nodeSize,
  slotSources,
  SPACING_GAPS,
} from './layout';

const saga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    { id: 'state-1', type: 'state', name: 'Reserving stock' },
    { id: 'state-2', type: 'state', name: 'Charging payment' },
    { id: 'state-3', type: 'state', name: 'Shipping' },
    { id: 'end-1', type: 'end', name: 'Cancelled' },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'start-1',
      target: 'state-1',
      kind: 'forward',
      event: 'OrderSubmitted',
    },
    { id: 'edge-2', source: 'state-1', target: 'state-2', kind: 'forward' },
    { id: 'edge-3', source: 'state-2', target: 'state-3', kind: 'forward' },
    {
      id: 'edge-4',
      source: 'state-2',
      target: 'end-1',
      kind: 'forward',
      event: 'PaymentFailed',
    },
    { id: 'edge-5', source: 'state-3', target: 'state-1', kind: 'compensation' },
  ],
};

describe('diagram layout', () => {
  it('grows a state card only when its description is unfolded', () => {
    const node = { id: 'a', type: 'state', name: 'a', description: 'one\ntwo' } as never;
    const folded = nodeSize(node);
    expect(nodeSize(node, true).height).toBeGreaterThan(folded.height);
    expect(nodeSize({ id: 'b', type: 'state', name: 'b' } as never, true)).toEqual(
      nodeSize({ id: 'b', type: 'state', name: 'b' } as never),
    );
  });

  it('gives slots to states nothing follows and to decisions, never to final states', () => {
    expect(slotSources(saga).map((n) => n.id)).toEqual(['state-2', 'state-3']);
  });

  it('ignores compensation transitions when deciding what follows a state', () => {
    const diagram: Diagram = { ...saga, edges: saga.edges.filter((e) => e.id !== 'edge-2') };
    // Without edge-2 nothing follows state-1; state-3 is only left by a compensation edge.
    expect(slotSources(diagram).map((n) => n.id)).toEqual(['state-1', 'state-2', 'state-3']);
  });

  it('places every state in layers, with labels between them', () => {
    const { positions, slots, labels } = layoutDiagram(saga);
    expect([...positions.keys()]).toEqual(saga.nodes.map((n) => n.id));
    const y = (id: string) => positions.get(id)!.y;
    expect(y('start-1')).toBeLessThan(y('state-1'));
    expect(y('state-1')).toBeLessThan(y('state-2'));
    expect(y('state-2')).toBeLessThan(y('state-3'));
    expect(y('state-2')).toBeLessThan(y('end-1'));
    expect(slots.map((s) => s.sourceId)).toEqual(['state-2', 'state-3']);

    // Forward transitions only; each label sits between its two states.
    expect(labels.map((l) => l.edgeId)).toEqual(['edge-1', 'edge-2', 'edge-3', 'edge-4']);
    const label = labels[0];
    expect(label.position.y).toBeGreaterThan(y('start-1') + nodeSize(saga.nodes[0]).height);
    expect(label.position.y + label.size.height).toBeLessThan(y('state-1'));
  });

  it('lays out left to right', () => {
    const { positions } = layoutDiagram({ ...saga, direction: 'left-right' });
    expect(positions.get('start-1')!.x).toBeLessThan(positions.get('state-1')!.x);
    expect(positions.get('state-1')!.x).toBeLessThan(positions.get('state-2')!.x);
  });

  it('sizes transition labels by their rows, leaving room for the "+" along the line', () => {
    const empty = labelSize(saga.edges[1], 'top-bottom');
    expect(empty).toEqual({ width: 26, height: 26 });
    const one = labelSize(saga.edges[0], 'top-bottom');
    const two = labelSize({ ...saga.edges[3], eventSource: 'Shop API' }, 'top-bottom');
    expect(two.height).toBeGreaterThan(one.height);
    const sideways = labelSize({ ...saga.edges[3], eventSource: 'Shop API' }, 'left-right');
    expect(sideways.width).toBeGreaterThan(two.width);
    expect(sideways.height).toBeLessThan(two.height);
  });

  it('gives the source of an event its own label row', () => {
    const withSource = labelSize({ ...saga.edges[0], eventSource: 'Shop API' }, 'top-bottom');
    expect(withSource.height).toBeGreaterThan(labelSize(saga.edges[0], 'top-bottom').height);
  });

  it('sizes state cards by their activity and compensation chips', () => {
    expect(nodeSize({ id: 's', type: 'start', name: 'S' })).toEqual({ width: 180, height: 48 });
    const plain = nodeSize({ id: 'a', type: 'state', name: 'A' });
    const compensated = nodeSize({
      id: 'b',
      type: 'state',
      name: 'B',
      compensation: { name: 'UndoIt' },
    });
    expect(compensated.width).toBe(plain.width);
    expect(compensated.height).toBeGreaterThan(plain.height);

    const one = nodeSize({
      id: 'c',
      type: 'state',
      name: 'C',
      activities: [{ kind: 'command', name: 'ShipOrder' }],
    });
    const two = nodeSize({
      id: 'd',
      type: 'state',
      name: 'D',
      activities: [
        { kind: 'command', name: 'ShipOrder' },
        { kind: 'event', name: 'OrderAccepted' },
      ],
      compensation: { name: 'UndoIt' },
    });
    expect(one.height).toBe(compensated.height); // one chip row either way
    expect(two.height - one.height).toBe(2 * (compensated.height - plain.height - 6) + 0);
  });

  it('draws the initial and the final state as pills, and only states as cards', () => {
    const pill = { width: 180, height: 48 };
    expect(nodeSize({ id: 's', type: 'start', name: 'S' })).toEqual(pill);
    expect(nodeSize({ id: 'e', type: 'end', name: 'E' })).toEqual(pill);
    expect(isCompact({ id: 's', type: 'start', name: 'S' })).toBe(true);
    expect(isCompact({ id: 'e', type: 'end', name: 'E' })).toBe(true);
    expect(isCompact({ id: 'a', type: 'state', name: 'A' })).toBe(false);
    expect(nodeSize({ id: 'a', type: 'state', name: 'A' }).width).toBeGreaterThan(pill.width);
  });

  it('makes room for a guard in the label', () => {
    const plain = labelSize(saga.edges[0], 'top-bottom');
    const guarded = labelSize(
      { ...saga.edges[0], guard: 'the order total is more than a hundred' },
      'top-bottom',
    );
    expect(guarded.width).toBeGreaterThan(plain.width);
  });

  it('gives each ignored event a chip row on the card', () => {
    const plain = { id: 'a', type: 'state', name: 'a' } as const;
    const ignoring = { ...plain, ignores: ['X', 'Y'] };
    expect(nodeSize(ignoring).height).toBe(nodeSize(plain).height + 2 * 24 + 6);
  });

  it('draws the any node as a pill, and never as a decision', () => {
    const any = { id: 'any-1', type: 'any', name: 'Any state' } as const;
    expect(isCompact(any)).toBe(true);
    const diagram: Diagram = {
      direction: 'top-bottom',
      nodes: [any, ...saga.nodes],
      edges: [
        { id: 'a1', source: 'any-1', target: 'state-1', kind: 'forward', event: 'X' },
        { id: 'a2', source: 'any-1', target: 'state-2', kind: 'forward', event: 'Y' },
      ],
    };
    expect(decisionIds(diagram).has('any-1')).toBe(false);
    expect(layoutDiagram(diagram).positions.has('any-1')).toBe(true);
  });

  it('gives each timer a chip row on the card', () => {
    const plain = { id: 'a', type: 'state', name: 'a' } as const;
    const timed = { ...plain, timers: [{ action: 'schedule' as const, name: 'T' }] };
    expect(nodeSize(timed).height).toBe(nodeSize(plain).height + 24 + 6);
  });

  it('gives each request a chip row on the card', () => {
    const plain = { id: 'a', type: 'state', name: 'a' } as const;
    const requesting = { ...plain, requests: [{ name: 'R' }] };
    expect(nodeSize(requesting).height).toBe(nodeSize(plain).height + 24 + 6);
  });

  it('draws a join as a bar with room for its text, and never as a decision', () => {
    const join: DiagramNode = { id: 'join-1', type: 'join', name: 'Ready' };
    expect(nodeSize(join)).toEqual({ width: 200, height: 50 });
    const diagram: Diagram = {
      direction: 'top-bottom',
      nodes: [...saga.nodes, join],
      edges: [
        { id: 'j1', source: 'join-1', target: 'state-1', kind: 'forward', event: 'Ready' },
        { id: 'j2', source: 'join-1', target: 'state-2', kind: 'forward', event: 'Ready' },
      ],
    };
    expect(decisionIds(diagram).has('join-1')).toBe(false);
  });

  describe('loops', () => {
    // start → a → b → end, and b → a closes a loop.
    const looped: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'start-1', type: 'start', name: 'Initial' },
        { id: 'a', type: 'state', name: 'A' },
        { id: 'b', type: 'state', name: 'B' },
        { id: 'end-1', type: 'end', name: 'Done' },
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'a', kind: 'forward' },
        { id: 'e2', source: 'a', target: 'b', kind: 'forward', event: 'Go' },
        { id: 'e3', source: 'b', target: 'a', kind: 'forward', event: 'Retry' },
        { id: 'e4', source: 'b', target: 'end-1', kind: 'forward', event: 'Done' },
      ],
    };

    it('finds the transition that closes the loop, and only that one', () => {
      expect([...backEdgeIds(looped)]).toEqual(['e3']);
      expect(backEdgeIds(saga).size).toBe(0);
    });

    it('does not mistake a diamond (two paths joining) for a loop', () => {
      const diamond: Diagram = {
        ...looped,
        edges: [
          { id: 'e1', source: 'start-1', target: 'a', kind: 'forward' },
          { id: 'e2', source: 'start-1', target: 'b', kind: 'forward' },
          { id: 'e3', source: 'a', target: 'end-1', kind: 'forward' },
          { id: 'e4', source: 'b', target: 'end-1', kind: 'forward' },
        ],
      };
      expect(backEdgeIds(diamond).size).toBe(0);
    });

    it('finds loops that nothing leads into (every state has an incoming transition)', () => {
      const ring: Diagram = {
        ...looped,
        edges: [
          { id: 'r1', source: 'a', target: 'b', kind: 'forward' },
          { id: 'r2', source: 'b', target: 'a', kind: 'forward' },
        ],
      };
      expect(backEdgeIds(ring).size).toBe(1);
    });

    it('lays the diagram out as if the loop were not there, without a label for it', () => {
      const { positions, labels } = layoutDiagram(looped);
      expect(positions.get('a')!.y).toBeLessThan(positions.get('b')!.y);
      expect(positions.get('b')!.y).toBeLessThan(positions.get('end-1')!.y);
      expect(labels.map((l) => l.edgeId)).not.toContain('e3');
      expect(labels.map((l) => l.edgeId)).toContain('e4');
    });

    it('counts the loop as a transition: the state is a decision', () => {
      expect(decisionIds(looped).has('b')).toBe(true);
    });
  });

  describe('routes', () => {
    const base: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 'start-1', type: 'start', name: 'Initial' },
        { id: 'a', type: 'state', name: 'A' },
        { id: 'b', type: 'state', name: 'B' },
      ],
      edges: [
        { id: 'e1', source: 'start-1', target: 'a', kind: 'forward' },
        { id: 'e2', source: 'a', target: 'b', kind: 'forward', event: 'Paid', guard: 'big' },
        { id: 'e3', source: 'a', target: 'b', kind: 'forward', event: 'Paid', guard: 'small' },
      ],
    };

    it('gives parallel transitions a label each, side by side, and a route through each', () => {
      const { labels, routes } = layoutDiagram(base);
      const [one, two] = ['e2', 'e3'].map((id) => labels.find((l) => l.edgeId === id)!);
      expect(one).toBeTruthy();
      expect(two).toBeTruthy();
      expect(one.position).not.toEqual(two.position);
      expect(routes.get('e2')).toHaveLength(1);
      expect(routes.get('e3')).toHaveLength(1);
      expect(routes.get('e2')).not.toEqual(routes.get('e3'));
      // A single transition between two states needs no route.
      expect(routes.has('e1')).toBe(false);
    });

    it('routes a transition from a state to itself around the state', () => {
      const looped: Diagram = {
        ...base,
        edges: [
          ...base.edges.slice(0, 2),
          { id: 'self', source: 'b', target: 'b', kind: 'forward', event: 'Retry' },
        ],
      };
      const { positions, routes, labels } = layoutDiagram(looped);
      const b = positions.get('b')!;
      const size = nodeSize(looped.nodes[2]);
      const [down, up] = routes.get('self')!;
      expect(labels.map((l) => l.edgeId)).not.toContain('self');
      // Out below the state, along its right side, back in above it.
      // Far enough from the state for its label (110 wide at least) to sit on the line.
      expect(down.x).toBeGreaterThanOrEqual(b.x + size.width + 55 + 16);
      expect(down.y).toBeGreaterThan(b.y + size.height);
      expect(up.x).toBe(down.x);
      expect(up.y).toBeLessThan(b.y);
    });

    it('runs loops and compensation transitions in lanes beyond the diagram', () => {
      const looped: Diagram = {
        ...base,
        edges: [
          ...base.edges.slice(0, 2),
          { id: 'back', source: 'b', target: 'a', kind: 'forward', event: 'Again' },
          { id: 'undo', source: 'b', target: 'start-1', kind: 'compensation' },
        ],
      };
      const { positions, routes } = layoutDiagram(looped);
      const right = Math.max(
        ...looped.nodes.map((n) => positions.get(n.id)!.x + nodeSize(n).width),
      );
      const lane = (id: string) => routes.get(id)![0].x;
      expect(lane('back')).toBeGreaterThan(right);
      expect(lane('undo')).toBeGreaterThan(right);
      expect(lane('undo')).not.toBe(lane('back'));
      // Left to right, the lanes run below the diagram.
      const lr = layoutDiagram({ ...looped, direction: 'left-right' });
      const bottom = Math.max(
        ...looped.nodes.map((n) => lr.positions.get(n.id)!.y + nodeSize(n).height),
      );
      expect(lr.routes.get('back')![0].y).toBeGreaterThan(bottom);
    });
  });
});

describe('four directions and spacing presets', () => {
  type Box = { x: number; y: number; width: number; height: number };
  const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const layoutOf = (diagram: Diagram) => {
    const result = layoutDiagram(diagram);
    const box = (id: string): Box => {
      const node = diagram.nodes.find((n) => n.id === id)!;
      return { ...result.positions.get(id)!, ...nodeSize(node) };
    };
    return { ...result, box };
  };
  /** How far b is from a along the flow: positive when b comes after a. */
  const downstream = {
    'top-bottom': (a: Box, b: Box) => centre(b).y - centre(a).y,
    'bottom-top': (a: Box, b: Box) => centre(a).y - centre(b).y,
    'left-right': (a: Box, b: Box) => centre(b).x - centre(a).x,
    'right-left': (a: Box, b: Box) => centre(a).x - centre(b).x,
  } as const;

  it.each(Object.keys(downstream) as (keyof typeof downstream)[])(
    'runs %s: every state after the one it follows, the "+" slot after its state',
    (direction) => {
      const { box, slots } = layoutOf({ ...saga, direction });
      const after = downstream[direction];
      expect(after(box('start-1'), box('state-1'))).toBeGreaterThan(0);
      expect(after(box('state-1'), box('state-2'))).toBeGreaterThan(0);
      expect(after(box('state-2'), box('state-3'))).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(
          after(box(slot.sourceId), { ...slot.position, width: 40, height: 40 }),
        ).toBeGreaterThan(0);
      }
    },
  );

  it.each(['bottom-top', 'right-left'] as const)(
    'mirrors %s: the same picture as its forward direction, turned around',
    (direction) => {
      const forward = direction === 'bottom-top' ? 'top-bottom' : 'left-right';
      const a = layoutOf({ ...saga, direction: forward });
      const b = layoutOf({ ...saga, direction });
      const axis = direction === 'bottom-top' ? 'y' : 'x';
      const across = axis === 'y' ? 'x' : 'y';
      const gaps = (l: typeof a) =>
        ['state-1', 'state-2', 'state-3'].map((id) =>
          Math.round(Math.abs(centre(l.box(id))[axis] - centre(l.box('start-1'))[axis])),
        );
      expect(gaps(b)).toEqual(gaps(a));
      expect(centre(b.box('state-2'))[across]).toBeCloseTo(centre(a.box('state-2'))[across], 0);
    },
  );

  it('puts the card of a label upstream of its "+", in every direction', () => {
    const box = { x: 100, y: 200, width: 150, height: 60 };
    expect(labelCard(box, 'top-bottom')).toEqual({ x: 100, y: 200, width: 150, height: 47 });
    expect(labelCard(box, 'bottom-top')).toEqual({ x: 100, y: 213, width: 150, height: 47 });
    expect(labelCard(box, 'left-right')).toEqual({ x: 100, y: 200, width: 137, height: 60 });
    expect(labelCard(box, 'right-left')).toEqual({ x: 113, y: 200, width: 137, height: 60 });
  });

  it('routes a loop and a compensation out of the downstream side and into the upstream side', () => {
    const looped: Diagram = {
      ...saga,
      edges: [
        ...saga.edges,
        { id: 'loop', source: 'state-2', target: 'state-2', kind: 'forward', event: 'Retry' },
      ],
    };
    for (const direction of ['top-bottom', 'bottom-top', 'left-right', 'right-left'] as const) {
      const { routes, box } = layoutOf({ ...looped, direction });
      const s2 = box('state-2');
      const [out, into] = routes.get('loop')!;
      const ok = {
        'top-bottom': out.y > s2.y + s2.height && into.y < s2.y,
        'bottom-top': out.y < s2.y && into.y > s2.y + s2.height,
        'left-right': out.x > s2.x + s2.width && into.x < s2.x,
        'right-left': out.x < s2.x && into.x > s2.x + s2.width,
      }[direction];
      expect(ok, direction).toBe(true);
      expect(routes.get('edge-5'), direction).toHaveLength(2);
    }
  });

  it('spreads the states by the spacing preset, keeping labels and slots clear of the states', () => {
    const extent = (spacing: Diagram['spacing']) => {
      const { box } = layoutOf({ ...saga, spacing });
      return box('state-3').y - box('start-1').y;
    };
    expect(extent('compact')).toBeLessThan(extent('normal'));
    expect(extent('normal')).toBeLessThan(extent('spacious'));
    expect(SPACING_GAPS.normal).toEqual({ node: 80, layer: 60 });
    for (const spacing of ['compact', 'normal', 'spacious'] as const) {
      for (const direction of ['top-bottom', 'bottom-top', 'left-right', 'right-left'] as const) {
        const { box, labels, slots } = layoutOf({ ...saga, spacing, direction });
        const states = saga.nodes.map((n) => box(n.id));
        const others: Box[] = [
          ...labels.map((l) => ({ ...l.position, ...l.size })),
          ...slots.map((s) => ({ ...s.position, width: 40, height: 40 })),
        ];
        const overlap = (a: Box, b: Box) =>
          a.x < b.x + b.width - 0.5 &&
          b.x < a.x + a.width - 0.5 &&
          a.y < b.y + b.height - 0.5 &&
          b.y < a.y + a.height - 0.5;
        for (const s of states)
          for (const o of others) expect(overlap(s, o), `${spacing} ${direction}`).toBe(false);
      }
    }
  });
});

describe('routing slips on the card', () => {
  it('give each slip a chip row', () => {
    const plain: DiagramNode = { id: 'a', type: 'state', name: 'A' };
    const withSlips: DiagramNode = {
      ...plain,
      routingSlips: [
        { name: 'S', activities: [{ name: 'X' }] },
        { name: 'T', activities: [] },
      ],
    };
    expect(nodeSize(withSlips).height - nodeSize(plain).height).toBe(2 * 24 + 6);
  });
});
