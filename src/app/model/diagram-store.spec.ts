import { TestBed } from '@angular/core/testing';
import { Diagram } from './diagram';
import { DiagramStore } from './diagram-store';

const blank = (): Diagram => ({ direction: 'top-bottom', nodes: [], edges: [] });

describe('DiagramStore', () => {
  let store: DiagramStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(DiagramStore);
  });

  it('starts with a single start node and no history', () => {
    expect(store.nodes()).toEqual([{ id: 'start-1', type: 'start', name: 'Initial' }]);
    expect(store.direction()).toBe('top-bottom');
    expect(store.canUndo()).toBe(false);
  });

  describe('editing', () => {
    beforeEach(() => store.load(blank()));

    it('adds nodes with stable incrementing ids', () => {
      expect(store.addNode('state')).toBe('state-1');
      expect(store.addNode('state')).toBe('state-2');
      expect(store.addNode('start')).toBe('start-1');
      expect(store.nodes()).toHaveLength(3);
    });

    it('connects nodes but rejects duplicates and unknown nodes', () => {
      store.addNode('state');
      store.addNode('state');
      expect(store.connect('state-1', 'state-2')).toBe('edge-1');
      expect(store.connect('state-1', 'state-2')).toBeNull();
      expect(store.connect('state-1', 'nope')).toBeNull();
      expect(store.connect('state-1', 'state-2', 'compensation')).toBe('edge-2');
      expect(store.edges()).toHaveLength(2);
    });

    it('lets a state lead to itself, once', () => {
      store.addNode('state');
      expect(store.connect('state-1', 'state-1')).toBe('edge-1');
      expect(store.connect('state-1', 'state-1')).toBeNull();
      expect(store.edges()).toEqual([
        { id: 'edge-1', source: 'state-1', target: 'state-1', kind: 'forward' },
      ]);
    });

    it('rejects edges out of end nodes or into start nodes', () => {
      store.addNode('start');
      store.addNode('end');
      store.addNode('state');
      expect(store.connect('end-1', 'state-1')).toBeNull();
      expect(store.connect('state-1', 'start-1')).toBeNull();
      expect(store.edges()).toHaveLength(0);
    });

    it('appends a connected node as a single undo step', () => {
      store.addNode('start');
      expect(store.appendNode('start-1', 'state')).toBe('state-1');
      expect(store.nodes().at(-1)).toEqual({ id: 'state-1', type: 'state', name: 'State' });
      expect(store.edges()).toEqual([
        { id: 'edge-1', source: 'start-1', target: 'state-1', kind: 'forward' },
      ]);
      store.undo();
      expect(store.nodes()).toHaveLength(1);
      expect(store.edges()).toHaveLength(0);
    });

    it('rejects appending to unknown or end nodes, or a start node', () => {
      store.addNode('state');
      store.addNode('end');
      expect(store.appendNode('nope', 'state')).toBeNull();
      expect(store.appendNode('end-1', 'state')).toBeNull();
      expect(store.appendNode('state-1', 'start')).toBeNull();
      expect(store.nodes()).toHaveLength(2);
    });

    it('inserts a state on a transition; the first half keeps the event and its source', () => {
      store.addNode('start');
      store.appendNode('start-1', 'end');
      store.updateEdge('edge-1', { event: 'OrderReceived', eventSource: 'Shop API' });
      expect(store.insertOnEdge('edge-1', 'state')).toBe('state-1');
      expect(store.edges()).toEqual([
        {
          id: 'edge-1',
          source: 'start-1',
          target: 'state-1',
          kind: 'forward',
          event: 'OrderReceived',
          eventSource: 'Shop API',
        },
        { id: 'edge-2', source: 'state-1', target: 'end-1', kind: 'forward' },
      ]);
      store.undo();
      expect(store.nodes()).toHaveLength(2);
      expect(store.edges()).toHaveLength(1);
    });

    it('does not insert start or end nodes, or on unknown edges', () => {
      store.addNode('start');
      store.appendNode('start-1', 'state');
      expect(store.insertOnEdge('edge-1', 'end')).toBeNull();
      expect(store.insertOnEdge('edge-1', 'start')).toBeNull();
      expect(store.insertOnEdge('nope', 'state')).toBeNull();
      expect(store.nodes()).toHaveLength(2);
    });

    it('removing a node on a path reconnects its neighbours', () => {
      store.addNode('start');
      store.appendNode('start-1', 'state');
      store.appendNode('state-1', 'end');
      store.updateEdge('edge-1', { event: 'OrderSubmitted' });
      store.remove({ nodeIds: ['state-1'] });
      expect(store.nodes().map((n) => n.id)).toEqual(['start-1', 'end-1']);
      expect(store.edges()).toEqual([
        {
          id: 'edge-1',
          source: 'start-1',
          target: 'end-1',
          kind: 'forward',
          event: 'OrderSubmitted',
        },
      ]);
    });

    it('removing a branching state removes its edges without reconnecting', () => {
      store.addNode('start');
      store.appendNode('start-1', 'state');
      store.appendNode('state-1', 'state');
      store.appendNode('state-1', 'end');
      store.remove({ nodeIds: ['state-1'] });
      expect(store.edges()).toEqual([]);
    });

    it('removes edges by id', () => {
      store.addNode('state');
      store.addNode('state');
      store.connect('state-1', 'state-2');
      store.remove({ edgeIds: ['edge-1'] });
      expect(store.edges()).toEqual([]);
      expect(store.nodes()).toHaveLength(2);
    });

    it('updates a node, dropping cleared fields, and can undo it', () => {
      store.addNode('state');
      store.updateNode('state-1', {
        name: 'Charge payment',
        timeout: '30s',
        compensation: { name: 'RefundPayment' },
      });
      expect(store.nodes()[0]).toEqual({
        id: 'state-1',
        type: 'state',
        name: 'Charge payment',
        timeout: '30s',
        compensation: { name: 'RefundPayment' },
      });
      store.updateNode('state-1', { timeout: undefined });
      expect(store.nodes()[0]).not.toHaveProperty('timeout');
      store.undo();
      store.undo();
      expect(store.nodes()[0].name).toBe('State');
    });

    it('keeps activities on the state: set, clear, undo, and gone with the state', () => {
      store.addNode('start');
      store.appendNode('start-1', 'state');
      store.appendNode('state-1', 'end');
      const activities = [
        { kind: 'command', name: 'ReserveStock' },
        { kind: 'event', name: 'OrderAccepted' },
      ] as const;
      store.updateNode('state-1', { activities: [...activities] });
      expect(store.nodes()[1].activities).toEqual(activities);
      store.updateNode('state-1', { activities: undefined });
      expect(store.nodes()[1]).not.toHaveProperty('activities');
      store.undo();
      expect(store.nodes()[1].activities).toEqual(activities);

      // Inserting a state into a transition leaves the neighbours' activities alone.
      store.insertOnEdge('edge-2', 'state');
      expect(store.nodes()[1].activities).toEqual(activities);
      // Removing the state takes its activities with it; the path is bridged.
      store.remove({ nodeIds: ['state-1'] });
      expect(store.nodes().some((n) => n.activities)).toBe(false);
    });

    it('updates an edge and can undo it', () => {
      store.addNode('start');
      store.appendNode('start-1', 'state');
      store.updateEdge('edge-1', { event: 'OrderSubmitted', kind: 'compensation' });
      expect(store.edges()[0]).toMatchObject({ event: 'OrderSubmitted', kind: 'compensation' });
      store.updateEdge('edge-1', { event: undefined });
      expect(store.edges()[0]).not.toHaveProperty('event');
      store.undo();
      store.undo();
      expect(store.edges()[0]).toEqual({
        id: 'edge-1',
        source: 'start-1',
        target: 'state-1',
        kind: 'forward',
      });
    });

    it('changes the direction as an undo step, ignoring no-ops', () => {
      store.setDirection('top-bottom');
      expect(store.canUndo()).toBe(false);
      store.setDirection('left-right');
      expect(store.direction()).toBe('left-right');
      store.undo();
      expect(store.direction()).toBe('top-bottom');
    });
  });

  describe('replace', () => {
    const moved = (d: Diagram): Diagram => ({ ...d, direction: 'left-right' });

    it('swaps the whole diagram as a single undo step', () => {
      store.load(blank());
      store.addNode('state');
      const before = store.diagram();
      const next: Diagram = {
        direction: 'left-right',
        nodes: [
          { id: 'start-1', type: 'start', name: 'Initial' },
          { id: 'state-1', type: 'state', name: 'Renamed' },
        ],
        edges: [{ id: 'edge-1', source: 'start-1', target: 'state-1', kind: 'forward' }],
      };
      expect(store.replace(next)).toBe(true);
      expect(store.diagram()).toBe(next);
      store.undo();
      expect(store.diagram()).toBe(before);
      store.redo();
      expect(store.diagram()).toBe(next);
    });

    it('does nothing, and records no history, for an equal diagram', () => {
      store.load(blank());
      const copy: Diagram = { ...store.diagram(), nodes: [...store.nodes()] };
      expect(store.replace(copy)).toBe(false);
      expect(store.diagram()).not.toBe(copy);
      expect(store.canUndo()).toBe(false);
    });

    it('clears the redo stack like any other edit', () => {
      store.load(blank());
      store.addNode('state');
      store.undo();
      expect(store.canRedo()).toBe(true);
      store.replace(moved(store.diagram()));
      expect(store.canRedo()).toBe(false);
    });
  });

  describe('history', () => {
    beforeEach(() => store.load(blank()));

    it('undoes and redoes each edit as one step', () => {
      store.addNode('state');
      store.addNode('state');
      store.undo();
      expect(store.nodes()).toHaveLength(1);
      store.undo();
      expect(store.nodes()).toHaveLength(0);
      expect(store.canRedo()).toBe(true);
      store.redo();
      store.redo();
      expect(store.nodes()).toHaveLength(2);
      expect(store.canRedo()).toBe(false);
    });

    it('a new edit clears the redo stack', () => {
      store.addNode('state');
      store.undo();
      store.addNode('end');
      expect(store.canRedo()).toBe(false);
    });

    it('rejected edits and empty removals do not create history', () => {
      store.addNode('state');
      store.undo();
      expect(store.canUndo()).toBe(false);
      store.addNode('state');
      store.connect('state-1', 'nope');
      store.appendNode('nope', 'state');
      store.remove({});
      store.undo();
      expect(store.nodes()).toEqual([]);
    });

    it('load() resets history', () => {
      store.addNode('state');
      store.load(blank());
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });

    it('undo/redo are no-ops on empty history', () => {
      store.undo();
      store.redo();
      expect(store.nodes()).toEqual([]);
    });
  });

  describe('details', () => {
    it('sets the name and description as one undo step each', () => {
      store.setDetails({ name: 'Order Saga' });
      store.setDetails({ description: 'Takes an order to done.' });
      expect(store.diagram()).toMatchObject({
        name: 'Order Saga',
        description: 'Takes an order to done.',
      });
      store.undo();
      expect(store.diagram().description).toBeUndefined();
      expect(store.diagram().name).toBe('Order Saga');
      store.undo();
      expect(store.diagram().name).toBeUndefined();
      expect(store.canUndo()).toBe(false);
    });

    it('does not record a step when nothing changes', () => {
      store.setDetails({ name: 'Order Saga' });
      store.undo();
      store.redo();
      store.setDetails({ name: ' Order Saga ' });
      store.setDetails({ description: '' });
      store.undo();
      expect(store.diagram().name).toBeUndefined();
      expect(store.canUndo()).toBe(false);
    });
  });

  describe('the any node', () => {
    it('is added once and a second request is not an undo step', () => {
      store.load(blank());
      const id = store.addNode('any');
      expect(store.addNode('any')).toBe(id);
      expect(store.nodes()).toHaveLength(1);
      store.undo();
      expect(store.nodes()).toHaveLength(0);
      expect(store.canUndo()).toBe(false);
    });
  });

  describe('retargeting a transition', () => {
    it('is one undo step, and refused moves record nothing', () => {
      store.load(blank());
      const start = store.addNode('start');
      const first = store.appendNode(start, 'state')!;
      const second = store.appendNode(first, 'state')!;
      const third = store.addNode('state');
      store.load(store.diagram());
      const edge = store.edges().find((e) => e.target === second)!;

      expect(store.setEdgeTarget(edge.id, 'nope')).toBe(false);
      expect(store.setEdgeTarget(edge.id, start)).toBe(false);
      expect(store.setEdgeTarget(edge.id, second)).toBe(true);
      expect(store.canUndo()).toBe(false);

      expect(store.setEdgeTarget(edge.id, third)).toBe(true);
      expect(store.edges().find((e) => e.id === edge.id)?.target).toBe(third);
      store.undo();
      expect(store.edges().find((e) => e.id === edge.id)?.target).toBe(second);
      expect(store.canUndo()).toBe(false);
    });

    it('can point a transition back at its own state', () => {
      store.load(blank());
      const start = store.addNode('start');
      const first = store.appendNode(start, 'state')!;
      const second = store.appendNode(first, 'state')!;
      store.load(store.diagram());
      const edge = store.edges().find((e) => e.target === second)!;
      expect(store.setEdgeTarget(edge.id, first)).toBe(true);
      expect(store.edges().find((e) => e.id === edge.id)).toMatchObject({
        source: first,
        target: first,
      });
    });
  });
});
