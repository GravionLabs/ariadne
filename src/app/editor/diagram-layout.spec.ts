import { Diagram } from '../model/diagram';
import { labelSize, layoutDiagram, nodeSize, slotSources } from './diagram-layout';

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
      activities: [{ kind: 'command', name: 'ReleaseStock' }],
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
    const two = labelSize(saga.edges[3], 'top-bottom');
    expect(two.height).toBeGreaterThan(one.height);
    const sideways = labelSize(saga.edges[3], 'left-right');
    expect(sideways.width).toBeGreaterThan(two.width);
    expect(sideways.height).toBeLessThan(two.height);
  });

  it('gives the source of an event its own label row', () => {
    const withSource = labelSize({ ...saga.edges[0], eventSource: 'Shop API' }, 'top-bottom');
    expect(withSource.height).toBeGreaterThan(labelSize(saga.edges[0], 'top-bottom').height);
  });

  it('sizes state cards by their compensation chip', () => {
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
  });
});
