import { Diagram } from './diagram';
import { DiagramFormatError, parseDiagram, serializeDiagram } from './diagram-yaml';

const sample: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'state-1',
      type: 'state',
      name: 'Charging payment',
      description: 'Waits for the payment provider',
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
      activities: [
        { kind: 'command', name: 'ChargePayment' },
        { kind: 'event', name: 'OrderAccepted' },
      ],
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
      "version: 2
      direction: top-bottom
      nodes:
        - id: start-1
          type: start
          name: Initial
        - id: state-1
          type: state
          name: Charging payment
          description: Waits for the payment provider
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
          activities:
            - command: ChargePayment
            - event: OrderAccepted
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
    expect(text).toContain(
      '    event: OrderSubmitted\n    eventSource: Shop API\n    activities:\n',
    );
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
    expect(parseDiagram('version: 2\n')).toEqual({
      direction: 'top-bottom',
      nodes: [],
      edges: [],
    });
  });

  it('treats an empty event or activity list as absent', () => {
    const text = `
version: 2
nodes:
  - { id: a, type: state, name: A }
  - { id: b, type: state, name: B }
edges:
  - { id: e, source: a, target: b, event: '', activities: [] }
`;
    const diagram = parseDiagram(text);
    expect(diagram.edges[0]).not.toHaveProperty('event');
    expect(diagram.edges[0]).not.toHaveProperty('activities');
  });

  it.each([
    ['nodes: [', /Not valid YAML/],
    ['- 1', /file must be a mapping/],
    ['version: 3', /Unsupported format version 3/],
    ['version: 2\ndirection: diagonal', /direction must be one of top-bottom, left-right/],
    ['version: 2\nnodes: {}', /nodes must be a list/],
    ['version: 2\nnodes:\n  - { id: a, type: task, name: A }', /nodes\[0\]\.type/],
    // `step` and `decision` only exist in version 1.
    [
      'version: 2\nnodes:\n  - { id: a, type: step, name: A }',
      /nodes\[0\]\.type must be one of start, end, state/,
    ],
    [
      'version: 2\nnodes:\n  - { id: a, type: state, name: A }\n  - { id: a, type: state, name: B }',
      /Duplicate node id "a"/,
    ],
    [
      'version: 2\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: zz }',
      /edges\[0\]\.target "zz" is not a node/,
    ],
    [
      'version: 2\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, activities: [{ query: GetOrder }] }',
      /edges\[0\]\.activities\[0\] must be "command: <Name>" or "event: <Name>"/,
    ],
    [
      'version: 2\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, activities: [{ command: "" }] }',
      /edges\[0\]\.activities\[0\]\.command must be a non-empty string/,
    ],
    [
      'version: 2\nnodes:\n  - { id: a, type: state, name: A }\nedges:\n  - { id: e, source: a, target: a, event: 3 }',
      /edges\[0\]\.event must be a string/,
    ],
  ])('rejects invalid input %#', (text, message) => {
    expect(() => parseDiagram(text)).toThrow(DiagramFormatError);
    expect(() => parseDiagram(text)).toThrow(message);
  });
});
