import { Diagram } from './diagram';
import {
  DiagramFormatError,
  parseDiagram,
  parseDiagramWithNotes,
  serializeDiagram,
} from './diagram-yaml';

const sample: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'state-1',
      type: 'state',
      name: 'Charging payment',
      description: 'Waits for the payment provider',
      activities: [
        { kind: 'command', name: 'ChargePayment' },
        { kind: 'event', name: 'OrderAccepted' },
      ],
      retry: '3 attempts',
      compensation: { name: 'RefundPayment' },
    },
    { id: 'end-1', type: 'end', name: 'Completed' },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'start-1',
      target: 'state-1',
      kind: 'forward',
      event: 'OrderSubmitted',
    },
    { id: 'edge-2', source: 'state-1', target: 'end-1', kind: 'forward' },
  ],
};

describe('diagram YAML', () => {
  it('round-trips a diagram', () => {
    expect(parseDiagram(serializeDiagram(sample))).toEqual(sample);
  });

  it('is deterministic and stable across load/save', () => {
    const text = serializeDiagram(sample);
    expect(serializeDiagram(parseDiagram(text))).toBe(text);
  });

  it('writes a readable, versioned file with fixed key order and no positions', () => {
    expect(serializeDiagram(sample)).toMatchInlineSnapshot(`
      "version: 3
      direction: top-bottom
      nodes:
        - id: start-1
          type: start
          name: Initial
        - id: state-1
          type: state
          name: Charging payment
          description: Waits for the payment provider
          activities:
            - command: ChargePayment
            - event: OrderAccepted
          retry: 3 attempts
          compensation:
            name: RefundPayment
        - id: end-1
          type: end
          name: Completed
      edges:
        - id: edge-1
          source: start-1
          target: state-1
          kind: forward
          event: OrderSubmitted
        - id: edge-2
          source: state-1
          target: end-1
          kind: forward
      "
    `);
  });

  it('round-trips the source of an external event, written right after the event', () => {
    const diagram: Diagram = {
      ...sample,
      edges: [{ ...sample.edges[0], eventSource: 'Shop API' }, sample.edges[1]],
    };
    const text = serializeDiagram(diagram);
    expect(text).toContain('    event: OrderSubmitted\n    eventSource: Shop API\n');
    expect(parseDiagram(text)).toEqual(diagram);
  });

  it('round-trips the left-right direction', () => {
    const diagram: Diagram = { ...sample, direction: 'left-right' };
    expect(parseDiagram(serializeDiagram(diagram))).toEqual(diagram);
  });

  it('reads version 1 files: steps and decisions become states, positions and ports are ignored', () => {
    const text = `
version: 1
nodes:
  - { id: a, type: step, name: A, position: { x: 10, y: 20 } }
  - { id: b, type: decision, name: B, position: { x: 0, y: 0 } }
edges:
  - { id: e, source: a, target: b, sourcePort: s, targetPort: nw }
`;
    expect(parseDiagram(text)).toEqual({
      direction: 'top-bottom',
      nodes: [
        { id: 'a', type: 'state', name: 'A' },
        { id: 'b', type: 'state', name: 'B' },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', kind: 'forward' }],
    });
  });

  it('reads an empty diagram and defaults the edge kind and direction', () => {
    expect(parseDiagram('version: 3\n')).toEqual({
      direction: 'top-bottom',
      nodes: [],
      edges: [],
    });
  });

  it('treats an empty event or activity list as absent', () => {
    const text = `
version: 3
nodes:
  - { id: a, type: state, name: A, activities: [] }
  - { id: b, type: state, name: B }
edges:
  - { id: e, source: a, target: b, event: '' }
`;
    const diagram = parseDiagram(text);
    expect(diagram.nodes[0]).not.toHaveProperty('activities');
    expect(diagram.edges[0]).not.toHaveProperty('event');
  });

  describe('version 2 files (activities on transitions)', () => {
    const v2 = `
version: 2
direction: top-bottom
nodes:
  - { id: s, type: start, name: Initial }
  - { id: a, type: state, name: Reserving stock }
  - { id: b, type: state, name: Charging payment, activities: [{ command: ChargePayment }] }
  - { id: f, type: end, name: Completed }
edges:
  - id: e1
    source: s
    target: a
    event: OrderReceived
    activities:
      - command: ReserveStock
  - id: e2
    source: a
    target: b
    event: StockReserved
  - id: e3
    source: b
    target: f
    event: PaymentCharged
    activities:
      - command: ShipOrder
      - event: OrderAccepted
  - id: e4
    source: a
    target: f
    kind: compensation
    event: OrderCancelled
    activities:
      - event: OrderAccepted
      - command: ShipOrder
`;

    it('moves transition activities onto the state they lead into, in edge order', () => {
      const { diagram } = parseDiagramWithNotes(v2);
      const activities = (id: string) => diagram.nodes.find((n) => n.id === id)?.activities;
      expect(activities('a')).toEqual([{ kind: 'command', name: 'ReserveStock' }]);
      expect(activities('b')).toEqual([{ kind: 'command', name: 'ChargePayment' }]);
      // A final state cannot do anything: what the transitions into it did is dropped.
      expect(activities('f')).toBeUndefined();
      expect(diagram.nodes.find((n) => n.id === 's')).not.toHaveProperty('activities');
      expect(diagram.edges.every((e) => !('activities' in e))).toBe(true);
    });

    it('reports what was moved and what had to be dropped, naming the states', () => {
      const { notes } = parseDiagramWithNotes(v2);
      expect(notes).toHaveLength(2);
      expect(notes[0]).toContain('"Reserving stock"');
      expect(notes[0]).not.toContain('Charging payment');
      expect(notes[0]).not.toContain('Completed');
      expect(notes[1]).toContain('"Completed" (send ShipOrder, publish OrderAccepted)');
    });

    it('merges what several transitions into one state did, without duplicates', () => {
      const text = `
version: 2
nodes:
  - { id: a, type: state, name: A }
  - { id: b, type: state, name: B }
  - { id: c, type: state, name: C }
edges:
  - { id: e1, source: a, target: c, activities: [{ command: X }, { event: Y }] }
  - { id: e2, source: b, target: c, activities: [{ event: Y }, { command: Z }] }
`;
      const { diagram } = parseDiagramWithNotes(text);
      expect(diagram.nodes[2].activities).toEqual([
        { kind: 'command', name: 'X' },
        { kind: 'event', name: 'Y' },
        { kind: 'command', name: 'Z' },
      ]);
    });

    it('writes the migrated diagram as version 3 without transition activities', () => {
      const text = serializeDiagram(parseDiagram(v2));
      expect(text).toContain('version: 3');
      expect(text).not.toMatch(/edges:[\s\S]*activities:/);
      expect(parseDiagramWithNotes(text).notes).toEqual([]);
    });

    it('has nothing to report when no transition had activities', () => {
      const text = 'version: 3\nnodes:\n  - { id: a, type: state, name: A }\n';
      expect(parseDiagramWithNotes(text).notes).toEqual([]);
    });
  });

  it('reports no notes for current files', () => {
    expect(parseDiagramWithNotes(serializeDiagram(sample)).notes).toEqual([]);
  });

  it.each([
    ['nodes: [', /Not valid YAML/],
    ['- 1', /file must be a mapping/],
    ['version: 4', /Unsupported format version 4/],
    ['version: 3\ndirection: diagonal', /direction must be one of top-bottom, left-right/],
    ['version: 3\nnodes: {}', /nodes must be a list/],
    ['version: 3\nnodes:\n  - { id: a, type: task, name: A }', /nodes\[0\]\.type/],
    // `step` and `decision` only exist in version 1.
    [
      'version: 3\nnodes:\n  - { id: a, type: step, name: A }',
      /nodes\[0\]\.type must be one of start, end, state/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A }\n  - { id: a, type: state, name: B }',
      /Duplicate node id "a"/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: zz }',
      /edges\[0\]\.target "zz" is not a node/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A, activities: [{ query: GetOrder }] }',
      /nodes\[0\]\.activities\[0\] must be "command: <Name>" or "event: <Name>"/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A, activities: [{ command: "" }] }',
      /nodes\[0\]\.activities\[0\]\.command must be a non-empty string/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: end, name: A, activities: [{ event: X }] }',
      /nodes\[0\]\.activities is only allowed on states, not on the final state/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: start, name: A, activities: [{ command: X }] }',
      /nodes\[0\]\.activities is only allowed on states, not on the initial state/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A, activities: [{ command: X, event: Y }] }',
      /nodes\[0\]\.activities\[0\] must be "command: <Name>" or "event: <Name>"/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, activities: [{ command: X }] }',
      /edges\[0\]\.activities is not allowed: activities belong to states/,
    ],
    [
      'version: 2\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, activities: [{ query: X }] }',
      /edges\[0\]\.activities\[0\] must be "command: <Name>" or "event: <Name>"/,
    ],
    [
      'version: 3\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, event: 3 }',
      /edges\[0\]\.event must be a string/,
    ],
  ])('rejects invalid input %#', (text, message) => {
    expect(() => parseDiagram(text)).toThrow(DiagramFormatError);
    expect(() => parseDiagram(text)).toThrow(message);
  });
});

describe('name and description', () => {
  const named: Diagram = { ...sample, name: 'Order Saga', description: 'Takes an order to done.' };

  it('writes them right after the version, and omits them when unset', () => {
    expect(serializeDiagram(named).split('\n').slice(0, 4)).toEqual([
      'version: 3',
      'name: Order Saga',
      'description: Takes an order to done.',
      'direction: top-bottom',
    ]);
    expect(serializeDiagram(sample)).not.toMatch(/^(name|description):/m);
  });

  it('round-trips', () => {
    expect(parseDiagram(serializeDiagram(named))).toEqual(named);
    expect(serializeDiagram(parseDiagram(serializeDiagram(named)))).toBe(serializeDiagram(named));
  });

  it('keeps files without them as they were', () => {
    const parsed = parseDiagram(serializeDiagram(sample));
    expect('name' in parsed).toBe(false);
    expect('description' in parsed).toBe(false);
  });

  it('trims them and treats empty text as unset', () => {
    const parsed = parseDiagram('version: 3\nname: "  Order Saga  "\ndescription: ""\nnodes: []');
    expect(parsed.name).toBe('Order Saga');
    expect('description' in parsed).toBe(false);
  });

  it('keeps a multi-line description', () => {
    const text = 'Line one.\nLine two.';
    expect(parseDiagram(serializeDiagram({ ...sample, description: text })).description).toBe(text);
  });

  it.each([
    ['name: 3', /name must be a string/],
    ['description: [a]', /description must be a string/],
  ])('rejects %s', (line, message) => {
    expect(() => parseDiagram(`version: 3\n${line}\nnodes: []`)).toThrow(message);
  });
});

describe('guard', () => {
  const guarded: Diagram = {
    ...sample,
    edges: [
      {
        id: 'e1',
        source: 'start-1',
        target: 'state-1',
        kind: 'forward',
        event: 'Go',
        guard: 'amount > 100',
      },
      { id: 'e2', source: 'start-1', target: 'end-1', kind: 'forward', event: 'Go' },
    ],
  };

  it('is written after the event source and round-trips', () => {
    const text = serializeDiagram(guarded);
    expect(text).toContain('    event: Go\n    guard: amount > 100\n');
    expect(parseDiagram(text)).toEqual(guarded);
  });

  it('is omitted when empty', () => {
    const parsed = parseDiagram(
      'version: 3\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, event: Go, guard: "  " }',
    );
    expect('guard' in parsed.edges[0]).toBe(false);
  });

  it('needs an event', () => {
    expect(() =>
      parseDiagram(
        'version: 3\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, guard: x }',
      ),
    ).toThrow(/edges\[0\]\.guard needs an event/);
  });
});

describe('ignored events and the any node', () => {
  const withBoth: Diagram = {
    ...sample,
    nodes: [
      ...sample.nodes.map((n) =>
        n.id === 'state-1' ? { ...n, ignores: ['OrderCancelled', 'Ping'] } : n,
      ),
      { id: 'any-1', type: 'any', name: 'Any state' },
    ],
    edges: [{ id: 'e1', source: 'any-1', target: 'end-1', kind: 'forward', event: 'Abort' }],
  };

  it('round-trips, writing ignores after the activities', () => {
    const text = serializeDiagram(withBoth);
    expect(text).toMatch(/ {4}ignores:\n {6}- OrderCancelled\n {6}- Ping\n {4}retry: 3 attempts/);
    expect(parseDiagram(text)).toEqual(withBoth);
  });

  it('omits an empty ignores list', () => {
    const parsed = parseDiagram(
      'version: 3\nnodes:\n  - { id: a, type: state, name: A, ignores: [] }',
    );
    expect('ignores' in parsed.nodes[0]).toBe(false);
  });

  it.each([
    [
      '{ id: a, type: end, name: A, ignores: [X] }',
      /nodes\[0\]\.ignores is only allowed on states/,
    ],
    [
      '{ id: a, type: any, name: A, ignores: [X] }',
      /nodes\[0\]\.ignores is only allowed on states/,
    ],
    [
      '{ id: a, type: state, name: A, ignores: [""] }',
      /nodes\[0\]\.ignores\[0\] must be a non-empty string/,
    ],
    ['{ id: a, type: state, name: A, ignores: X }', /nodes\[0\]\.ignores must be a list/],
    [
      '{ id: a, type: any, name: A, activities: [{ command: X }] }',
      /activities is only allowed on states, not on the "any" node/,
    ],
  ])('rejects %s', (node, message) => {
    expect(() => parseDiagram(`version: 3\nnodes:\n  - ${node}`)).toThrow(message);
  });

  it('allows only one any node', () => {
    expect(() =>
      parseDiagram(
        'version: 3\nnodes:\n  - { id: a, type: any, name: A }\n  - { id: b, type: any, name: B }',
      ),
    ).toThrow(/only one node of type "any"/);
  });
});
