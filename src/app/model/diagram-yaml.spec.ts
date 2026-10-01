import { Diagram } from './diagram';
import { DiagramFormatError, parseDiagram, serializeDiagram } from './diagram-yaml';

const sample: Diagram = {
  nodes: [
    { id: 'start-1', type: 'start', name: 'Start', position: { x: 0, y: 0 } },
    {
      id: 'step-1',
      type: 'step',
      name: 'Charge card',
      position: { x: 200, y: 10 },
      description: 'Calls the payment provider',
      retry: '3 attempts',
      compensation: { name: 'Refund' },
    },
    { id: 'end-1', type: 'end', name: 'End', position: { x: 400, y: 0 } },
  ],
  edges: [
    { id: 'edge-1', source: 'start-1', target: 'step-1', kind: 'forward' },
    { id: 'edge-2', source: 'step-1', target: 'end-1', kind: 'forward' },
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

  it('writes a readable, versioned file with fixed key order', () => {
    expect(serializeDiagram(sample)).toMatchInlineSnapshot(`
      "version: 1
      nodes:
        - id: start-1
          type: start
          name: Start
          position:
            x: 0
            y: 0
        - id: step-1
          type: step
          name: Charge card
          position:
            x: 200
            y: 10
          description: Calls the payment provider
          retry: 3 attempts
          compensation:
            name: Refund
        - id: end-1
          type: end
          name: End
          position:
            x: 400
            y: 0
      edges:
        - id: edge-1
          source: start-1
          target: step-1
          kind: forward
        - id: edge-2
          source: step-1
          target: end-1
          kind: forward
      "
    `);
  });

  it('rounds positions to whole pixels', () => {
    const text = serializeDiagram({
      nodes: [{ id: 'step-1', type: 'step', name: 'S', position: { x: 10.4, y: 20.6 } }],
      edges: [],
    });
    expect(parseDiagram(text).nodes[0].position).toEqual({ x: 10, y: 21 });
  });

  it('reads an empty diagram and defaults the edge kind', () => {
    expect(parseDiagram('version: 1\n')).toEqual({ nodes: [], edges: [] });
    const text = `
version: 1
nodes:
  - { id: a, type: step, name: A, position: { x: 0, y: 0 } }
  - { id: b, type: step, name: B, position: { x: 0, y: 0 } }
edges:
  - { id: e, source: a, target: b }
`;
    expect(parseDiagram(text).edges[0].kind).toBe('forward');
  });

  it.each([
    ['nodes: [', /Not valid YAML/],
    ['- 1', /file must be a mapping/],
    ['version: 2', /Unsupported format version 2/],
    ['version: 1\nnodes: {}', /nodes must be a list/],
    [
      'version: 1\nnodes:\n  - { id: a, type: task, name: A, position: { x: 0, y: 0 } }',
      /nodes\[0\]\.type/,
    ],
    [
      'version: 1\nnodes:\n  - { id: a, type: step, name: A }',
      /nodes\[0\]\.position must be a mapping/,
    ],
    [
      'version: 1\nnodes:\n  - { id: a, type: step, name: A, position: { x: 0, y: 0 } }\n  - { id: a, type: step, name: B, position: { x: 0, y: 0 } }',
      /Duplicate node id "a"/,
    ],
    [
      'version: 1\nnodes:\n  - { id: a, type: step, name: A, position: { x: 0, y: 0 } }\nedges:\n  - { id: e, source: a, target: zz }',
      /edges\[0\]\.target "zz" is not a node/,
    ],
  ])('rejects invalid input %#', (text, message) => {
    expect(() => parseDiagram(text)).toThrow(DiagramFormatError);
    expect(() => parseDiagram(text)).toThrow(message);
  });
});
