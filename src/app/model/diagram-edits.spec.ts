import { describe, expect, it } from 'vitest';
import { Diagram, emptyDiagram } from './diagram';
import {
  addNode,
  appendNode,
  connect,
  insertOnEdge,
  removeElements,
  updateDetails,
  updateEdge,
  updateNode,
} from './diagram-edits';

/** start-1 → state-1 → end-1, as plain data. */
function path(): Diagram {
  return {
    ...emptyDiagram(),
    nodes: [
      { id: 'start-1', type: 'start', name: 'Initial' },
      { id: 'state-1', type: 'state', name: 'Mid' },
      { id: 'end-1', type: 'end', name: 'Done' },
    ],
    edges: [
      { id: 'edge-1', source: 'start-1', target: 'state-1', kind: 'forward', event: 'Go' },
      { id: 'edge-2', source: 'state-1', target: 'end-1', kind: 'forward' },
    ],
  };
}

describe('diagram edits', () => {
  it('adds an unconnected node without touching the input', () => {
    const before = path();
    const { diagram, id } = addNode(before, 'state');
    expect(diagram.nodes.at(-1)).toMatchObject({ id, type: 'state' });
    expect(diagram.nodes).toHaveLength(4);
    expect(before.nodes).toHaveLength(3);
  });

  it('appends a node with a forward edge', () => {
    const result = appendNode(path(), 'state-1', 'state')!;
    expect(result.diagram.nodes.at(-1)!.id).toBe(result.id);
    expect(result.diagram.edges.at(-1)).toMatchObject({
      source: 'state-1',
      target: result.id,
      kind: 'forward',
    });
  });

  it('refuses to append after an end or to a start', () => {
    expect(appendNode(path(), 'end-1', 'state')).toBeNull();
    expect(appendNode(path(), 'state-1', 'start')).toBeNull();
    expect(appendNode(path(), 'missing', 'state')).toBeNull();
  });

  it('splits an edge, keeping the id and event on the first half', () => {
    const { diagram, id } = insertOnEdge(path(), 'edge-1', 'state')!;
    expect(diagram.edges.find((e) => e.id === 'edge-1')).toMatchObject({
      source: 'start-1',
      target: id,
      event: 'Go',
    });
    const second = diagram.edges.find((e) => e.source === id)!;
    expect(second).toMatchObject({ target: 'state-1', kind: 'forward' });
    expect(second.event).toBeUndefined();
  });

  it('refuses to split an edge with a start or an end', () => {
    expect(insertOnEdge(path(), 'edge-1', 'end')).toBeNull();
    expect(insertOnEdge(path(), 'edge-1', 'start')).toBeNull();
    expect(insertOnEdge(path(), 'missing', 'state')).toBeNull();
  });

  it('drops patched fields set to undefined', () => {
    const named = updateNode(path(), 'state-1', { description: 'Text' });
    expect(named.nodes[1].description).toBe('Text');
    const cleared = updateNode(named, 'state-1', { description: undefined });
    expect('description' in cleared.nodes[1]).toBe(false);

    const edge = updateEdge(path(), 'edge-1', { event: undefined });
    expect('event' in edge.edges[0]).toBe(false);
  });

  it('connects two nodes once', () => {
    const first = connect(path(), 'start-1', 'end-1')!;
    expect(first.diagram.edges.at(-1)).toMatchObject({ source: 'start-1', target: 'end-1' });
    expect(connect(first.diagram, 'start-1', 'end-1')).toBeNull();
    expect(connect(path(), 'state-1', 'state-1')).toBeNull();
    expect(connect(path(), 'end-1', 'state-1')).toBeNull();
  });

  it('closes the gap when removing a node on a path', () => {
    const { nodes, edges } = removeElements(path(), { nodeIds: ['state-1'] });
    expect(nodes.map((n) => n.id)).toEqual(['start-1', 'end-1']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'start-1', target: 'end-1', event: 'Go' });
  });

  it('removes attached edges without a bridge for several nodes', () => {
    const { nodes, edges } = removeElements(path(), { nodeIds: ['state-1', 'end-1'] });
    expect(nodes.map((n) => n.id)).toEqual(['start-1']);
    expect(edges).toEqual([]);
  });

  it('removes only the selected edge', () => {
    const { nodes, edges } = removeElements(path(), { edgeIds: ['edge-2'] });
    expect(nodes).toHaveLength(3);
    expect(edges.map((e) => e.id)).toEqual(['edge-1']);
  });

  it('sets and clears the name and description', () => {
    const named = updateDetails(path(), { name: '  Order Saga ', description: 'About it' });
    expect(named).toMatchObject({ name: 'Order Saga', description: 'About it' });
    const renamed = updateDetails(named, { name: 'Other' });
    expect(renamed).toMatchObject({ name: 'Other', description: 'About it' });
    const cleared = updateDetails(renamed, { name: '   ', description: undefined });
    expect('name' in cleared).toBe(false);
    expect('description' in cleared).toBe(false);
  });

  it('adds the any node once; asking again gives the same diagram', () => {
    const first = addNode(path(), 'any');
    expect(first.diagram.nodes.at(-1)).toMatchObject({
      id: 'any-1',
      type: 'any',
      name: 'Any state',
    });
    const again = addNode(first.diagram, 'any');
    expect(again.diagram).toBe(first.diagram);
    expect(again.id).toBe('any-1');
  });

  it('lets transitions leave the any node but never enter it', () => {
    const { diagram } = addNode(path(), 'any');
    expect(connect(diagram, 'any-1', 'state-1')).not.toBeNull();
    expect(appendNode(diagram, 'any-1', 'state')).not.toBeNull();
    expect(connect(diagram, 'state-1', 'any-1')).toBeNull();
    expect(insertOnEdge(diagram, 'edge-1', 'any')).toBeNull();
    expect(appendNode(diagram, 'state-1', 'any')).toBeNull();
  });

  it('adds a join after a state and into the middle of a transition, and lets it connect on', () => {
    const appended = appendNode(path(), 'state-1', 'join')!;
    expect(appended.diagram.nodes.at(-1)).toMatchObject({ type: 'join', name: 'Join' });
    expect(connect(appended.diagram, appended.id, 'end-1')).not.toBeNull();
    const inserted = insertOnEdge(path(), 'edge-2', 'join')!;
    expect(inserted.diagram.edges.map((e) => [e.source, e.target])).toEqual([
      ['start-1', 'state-1'],
      ['state-1', inserted.id],
      [inserted.id, 'end-1'],
    ]);
  });
});
