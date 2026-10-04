import { Diagram } from './diagram';
import {
  DIAGRAM_LIMITS,
  DiagramFormatError,
  DiagramVersionError,
  diagramSizeProblem,
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

  it('tells a newer format version from other unsupported ones', () => {
    const newer = (() => {
      try {
        parseDiagram('version: 4');
      } catch (e) {
        return e;
      }
    })();
    expect(newer).toBeInstanceOf(DiagramVersionError);
    expect(newer).toBeInstanceOf(DiagramFormatError);
    expect((newer as DiagramVersionError).version).toBe(4);
    for (const text of ['version: 0', 'version: "4"', 'version: 3.5', 'nodes: []']) {
      expect(() => parseDiagram(text)).toThrow(DiagramFormatError);
      expect(() => parseDiagram(text)).not.toThrow(DiagramVersionError);
    }
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

describe('timers', () => {
  const timed: Diagram = {
    ...sample,
    nodes: sample.nodes.map((n) =>
      n.id === 'state-1'
        ? {
            ...n,
            timers: [
              { action: 'schedule' as const, name: 'PaymentTimeout', delay: '30s' },
              { action: 'unschedule' as const, name: 'OldTimeout' },
            ],
          }
        : n,
    ),
  };

  it('round-trips, writing the action as the key and timers after ignores', () => {
    const text = serializeDiagram(timed);
    expect(text).toContain(
      '    timers:\n      - schedule: PaymentTimeout\n        delay: 30s\n      - unschedule: OldTimeout\n',
    );
    expect(parseDiagram(text)).toEqual(timed);
  });

  it('omits an empty list and an empty delay', () => {
    const parsed = parseDiagram(
      'version: 3\nnodes:\n  - { id: a, type: state, name: A, timers: [{ schedule: T, delay: " " }] }\n  - { id: b, type: state, name: B, timers: [] }',
    );
    expect(parsed.nodes[0].timers).toEqual([{ action: 'schedule', name: 'T' }]);
    expect('timers' in parsed.nodes[1]).toBe(false);
  });

  it.each([
    [
      '{ id: a, type: end, name: A, timers: [{ schedule: T }] }',
      /nodes\[0\]\.timers is only allowed on states/,
    ],
    [
      '{ id: a, type: state, name: A, timers: [{ delay: 30s }] }',
      /nodes\[0\]\.timers\[0\] must be "schedule: <Name>" or "unschedule: <Name>"/,
    ],
    [
      '{ id: a, type: state, name: A, timers: [{ schedule: T, unschedule: T }] }',
      /must be "schedule: <Name>" or "unschedule: <Name>"/,
    ],
    [
      '{ id: a, type: state, name: A, timers: [{ unschedule: T, delay: 30s }] }',
      /nodes\[0\]\.timers\[0\]\.delay is only allowed with schedule/,
    ],
    [
      '{ id: a, type: state, name: A, timers: [{ schedule: "" }] }',
      /nodes\[0\]\.timers\[0\]\.schedule must be a non-empty string/,
    ],
    ['{ id: a, type: state, name: A, timers: T }', /nodes\[0\]\.timers must be a list/],
  ])('rejects %s', (node, message) => {
    expect(() => parseDiagram(`version: 3\nnodes:\n  - ${node}`)).toThrow(message);
  });
});

describe('requests', () => {
  const requesting: Diagram = {
    ...sample,
    nodes: sample.nodes.map((n) =>
      n.id === 'state-1'
        ? {
            ...n,
            requests: [{ name: 'ValidateAddress', timeout: '30s' }, { name: 'CheckFraud' }],
          }
        : n,
    ),
  };

  it('round-trips, writing "request:" as the key and requests before timers', () => {
    const text = serializeDiagram(requesting);
    expect(text).toContain(
      '    requests:\n      - request: ValidateAddress\n        timeout: 30s\n      - request: CheckFraud\n',
    );
    expect(parseDiagram(text)).toEqual(requesting);
  });

  it('omits an empty list and an empty timeout', () => {
    const parsed = parseDiagram(
      'version: 3\nnodes:\n  - { id: a, type: state, name: A, requests: [{ request: R, timeout: " " }] }\n  - { id: b, type: state, name: B, requests: [] }',
    );
    expect(parsed.nodes[0].requests).toEqual([{ name: 'R' }]);
    expect('requests' in parsed.nodes[1]).toBe(false);
  });

  it.each([
    [
      '{ id: a, type: start, name: A, requests: [{ request: R }] }',
      /nodes\[0\]\.requests is only allowed on states/,
    ],
    [
      '{ id: a, type: state, name: A, requests: [{ timeout: 30s }] }',
      /nodes\[0\]\.requests\[0\] must be "request: <Name>"/,
    ],
    [
      '{ id: a, type: state, name: A, requests: [{ request: "" }] }',
      /nodes\[0\]\.requests\[0\]\.request must be a non-empty string/,
    ],
    ['{ id: a, type: state, name: A, requests: R }', /nodes\[0\]\.requests must be a list/],
  ])('rejects %s', (node, message) => {
    expect(() => parseDiagram(`version: 3\nnodes:\n  - ${node}`)).toThrow(message);
  });
});

describe('joins', () => {
  const joined: Diagram = {
    ...sample,
    nodes: [...sample.nodes, { id: 'join-1', type: 'join', name: 'OrderReady' }],
    edges: [
      { id: 'e1', source: 'state-1', target: 'join-1', kind: 'forward', event: 'PaymentCharged' },
      { id: 'e2', source: 'join-1', target: 'end-1', kind: 'forward', event: 'OrderReady' },
    ],
  };

  it('round-trips; a join is just a named node, its events come from the transitions', () => {
    const text = serializeDiagram(joined);
    expect(text).toContain('  - id: join-1\n    type: join\n    name: OrderReady\n');
    expect(text).not.toContain('combines');
    expect(parseDiagram(text)).toEqual(joined);
  });

  it('ignores a "combines" key from an earlier draft of the format', () => {
    const parsed = parseDiagram(
      'version: 3\nnodes:\n  - { id: j, type: join, name: J, combines: [A, B] }',
    );
    expect(parsed.nodes[0]).toEqual({ id: 'j', type: 'join', name: 'J' });
  });

  it.each([
    [
      '{ id: a, type: join, name: A, activities: [{ command: X }] }',
      /activities is only allowed on states, not on the join/,
    ],
    [
      '{ id: a, type: join, name: A, timers: [{ schedule: X }] }',
      /nodes\[0\]\.timers is only allowed on states/,
    ],
  ])('rejects %s', (node, message) => {
    expect(() => parseDiagram(`version: 3\nnodes:\n  - ${node}`)).toThrow(message);
  });
});

describe('saga and event metadata', () => {
  const coded: Diagram = {
    ...sample,
    name: 'Order Saga',
    saga: {
      className: 'OrderStateMachine',
      namespace: 'Shop.Orders',
      instanceType: 'OrderState',
      stateProperty: 'CurrentState',
      contractsNamespace: 'Shop.Orders.Contracts',
    },
    events: [
      { name: 'OrderReceived', messageType: 'SubmitOrder', correlation: 'x => x.OrderId' },
      { name: 'PaymentCharged', correlation: 'CorrelationId' },
    ],
  };

  it('writes them after the name and description, with the keys of the format', () => {
    const lines = serializeDiagram(coded).split('\n');
    expect(lines.slice(0, 15)).toEqual([
      'version: 3',
      'name: Order Saga',
      'saga:',
      '  class: OrderStateMachine',
      '  namespace: Shop.Orders',
      '  instance: OrderState',
      '  stateProperty: CurrentState',
      '  contractsNamespace: Shop.Orders.Contracts',
      'events:',
      '  - name: OrderReceived',
      '    messageType: SubmitOrder',
      '    correlation: x => x.OrderId',
      '  - name: PaymentCharged',
      '    correlation: CorrelationId',
      'direction: top-bottom',
    ]);
  });

  it('writes the C# source file last in the saga block, and reads it back', () => {
    const withSource: Diagram = {
      ...coded,
      saga: { ...coded.saga, source: '../Sagas/OrderStateMachine.cs' },
    };
    const text = serializeDiagram(withSource);
    expect(text).toContain(
      '  contractsNamespace: Shop.Orders.Contracts\n  source: ../Sagas/OrderStateMachine.cs\nevents:',
    );
    expect(parseDiagram(text).saga?.source).toBe('../Sagas/OrderStateMachine.cs');
    expect(serializeDiagram(parseDiagram(text))).toBe(text);
  });

  it('drops an empty source', () => {
    expect(parseDiagram('version: 3\nsaga:\n  source: "  "\nnodes: []').saga).toBeUndefined();
  });

  it('round-trips, byte for byte', () => {
    const text = serializeDiagram(coded);
    expect(parseDiagram(text)).toEqual(coded);
    expect(serializeDiagram(parseDiagram(text))).toBe(text);
  });

  it('leaves older files and files without them unchanged', () => {
    const plain = serializeDiagram(sample);
    expect(plain).not.toMatch(/^(saga|events):/m);
    const parsed = parseDiagram(plain);
    expect('saga' in parsed).toBe(false);
    expect('events' in parsed).toBe(false);
  });

  it('takes part of the saga block, trims, and drops what is empty', () => {
    const parsed = parseDiagram(
      'version: 3\nsaga:\n  class: "  OrderStateMachine "\n  namespace: ""\nevents: []\nnodes: []',
    );
    expect(parsed.saga).toEqual({ className: 'OrderStateMachine' });
    expect('events' in parsed).toBe(false);
    expect('saga' in parseDiagram('version: 3\nsaga: {}\nnodes: []')).toBe(false);
  });

  it.each([
    ['saga: text', /saga must be a mapping/],
    ['saga:\n  class: 3', /saga\.class must be a string/],
    ['saga:\n  instance: [a]', /saga\.instance must be a string/],
    ['events: x', /events must be a list/],
    ['events:\n  - messageType: X', /events\[0\]\.name must be a non-empty string/],
    ['events:\n  - { name: A, correlation: 3 }', /events\[0\]\.correlation must be a string/],
    [
      'events:\n  - { name: A }\n  - { name: A, messageType: B }',
      /events\[1\]: the event "A" is described twice/,
    ],
  ])('rejects %s', (block, message) => {
    expect(() => parseDiagram(`version: 3\n${block}\nnodes: []`)).toThrow(message);
  });

  it('accepts an event that no transition uses and a transition whose event is not described', () => {
    const parsed = parseDiagram(
      'version: 3\nevents:\n  - { name: Unused, messageType: X }\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, event: Other }',
    );
    expect(parsed.events).toEqual([{ name: 'Unused', messageType: 'X' }]);
  });
});

describe('limits', () => {
  /** A file of exactly `bytes` bytes (UTF-8): a name padded with `pad`, which is `width` bytes wide. */
  const fileOfBytes = (bytes: number, pad = 'x', width = 1) => {
    const head = 'version: 3\nname: ';
    const tail = '\n';
    const count = (bytes - head.length - tail.length) / width;
    return `${head}${pad.repeat(count)}${tail}`;
  };
  const bytesOf = (text: string) => new TextEncoder().encode(text).byteLength;

  it('reads a file of exactly the largest size', () => {
    const text = fileOfBytes(DIAGRAM_LIMITS.maxBytes);
    expect(bytesOf(text)).toBe(DIAGRAM_LIMITS.maxBytes);
    expect(parseDiagram(text).name).toHaveLength(DIAGRAM_LIMITS.maxBytes - 18);
  });

  it('refuses a file one byte over, saying how big it is and what is read', () => {
    const text = fileOfBytes(DIAGRAM_LIMITS.maxBytes + 1);
    expect(() => parseDiagram(text)).toThrow(DiagramFormatError);
    expect(() => parseDiagram(text)).toThrow(
      'The file is 5 MB; Ariadne reads diagrams up to 5 MB.',
    );
  });

  it('says the size with a decimal when it is not a whole number of megabytes', () => {
    expect(() => parseDiagram(fileOfBytes(7_200_000))).toThrow(
      'The file is 7.2 MB; Ariadne reads diagrams up to 5 MB.',
    );
  });

  it('counts bytes, not characters: two-byte characters reach the limit sooner', () => {
    const text = fileOfBytes(DIAGRAM_LIMITS.maxBytes + 2, 'é', 2);
    expect(text.length).toBeLessThan(DIAGRAM_LIMITS.maxBytes);
    expect(() => parseDiagram(text)).toThrow(/The file is 5 MB/);
    expect(diagramSizeProblem(text)).toBeDefined();
    expect(diagramSizeProblem(fileOfBytes(DIAGRAM_LIMITS.maxBytes, 'é', 2))).toBeUndefined();
  });

  const nodesFile = (count: number) =>
    `version: 3\nnodes:\n${Array.from({ length: count }, (_, i) => `  - { id: n${i}, type: state, name: N }`).join('\n')}\n`;
  const edgesFile = (count: number) =>
    `${nodesFile(2)}edges:\n${Array.from({ length: count }, (_, i) => `  - { id: e${i}, source: n0, target: n1 }`).join('\n')}\n`;

  it('reads the most nodes allowed, and refuses one more', () => {
    expect(parseDiagram(nodesFile(DIAGRAM_LIMITS.maxNodes)).nodes).toHaveLength(
      DIAGRAM_LIMITS.maxNodes,
    );
    expect(() => parseDiagram(nodesFile(DIAGRAM_LIMITS.maxNodes + 1))).toThrow(
      'The file has 5001 nodes; Ariadne reads diagrams with up to 5000.',
    );
  });

  it('reads the most edges allowed, and refuses one more', () => {
    expect(parseDiagram(edgesFile(DIAGRAM_LIMITS.maxEdges)).edges).toHaveLength(
      DIAGRAM_LIMITS.maxEdges,
    );
    expect(() => parseDiagram(edgesFile(DIAGRAM_LIMITS.maxEdges + 1))).toThrow(
      'The file has 20001 edges; Ariadne reads diagrams with up to 20000.',
    );
  });

  const aliasesFile = (count: number) =>
    `version: 3\nname: &n Saga\nnodes:\n${Array.from({ length: count }, (_, i) => `  - { id: n${i}, type: state, name: *n }`).join('\n')}\n`;

  it('reads a file with fewer aliases than the limit, and refuses one with that many', () => {
    expect(parseDiagram(aliasesFile(DIAGRAM_LIMITS.maxAliases - 1)).nodes).toHaveLength(
      DIAGRAM_LIMITS.maxAliases - 1,
    );
    expect(() => parseDiagram(aliasesFile(DIAGRAM_LIMITS.maxAliases))).toThrow(DiagramFormatError);
    expect(() => parseDiagram(aliasesFile(DIAGRAM_LIMITS.maxAliases))).toThrow(/alias count/i);
  });

  it('refuses a "billion laughs" file quickly', () => {
    const levels = 'abcdefghi';
    const lines = [...levels].map((name, i) =>
      i === 0
        ? `${name}: &${name} [x, x, x, x, x, x, x, x, x]`
        : `${name}: &${name} [${Array(9)
            .fill(`*${levels[i - 1]}`)
            .join(', ')}]`,
    );
    const started = Date.now();
    expect(() => parseDiagram(`version: 3\n${lines.join('\n')}\nnodes: *i\n`)).toThrow(
      DiagramFormatError,
    );
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it.each([
    ['a flow list', `nodes: ${'['.repeat(10_000)}${']'.repeat(10_000)}`],
    ['a block list', `nodes:\n${'- '.repeat(10_000)}x`],
    ['a flow mapping', `nodes: ${'{a: '.repeat(10_000)}x${'}'.repeat(10_000)}`],
  ])(
    'refuses 10 000 levels of nesting (%s) with a message, not a stack overflow',
    (_what, nodes) => {
      const read = () => parseDiagram(`version: 3\n${nodes}\n`);
      expect(read).toThrow(DiagramFormatError);
      expect(read).toThrow('The file is nested too deeply to be read as a diagram.');
    },
  );
});

describe('YAML syntax errors', () => {
  it('give one line: the reason and where, without the code frame', () => {
    const text = 'version: 3\nnodes: [\n  - a: b\nedges: {\n';
    expect(() => parseDiagram(text)).toThrow(
      'Not valid YAML: Block collections are not allowed within flow collections at line 3, column 3:',
    );
    try {
      parseDiagram(text);
    } catch (e) {
      expect((e as Error).message).not.toContain('\n');
    }
  });
});
