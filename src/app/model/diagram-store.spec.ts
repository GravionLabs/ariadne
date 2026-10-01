import { TestBed } from '@angular/core/testing';
import { DiagramStore } from './diagram-store';

describe('DiagramStore', () => {
  let store: DiagramStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(DiagramStore);
  });

  it('adds nodes with stable incrementing ids', () => {
    expect(store.addNode('step', { x: 0, y: 0 })).toBe('step-1');
    expect(store.addNode('step', { x: 10, y: 10 })).toBe('step-2');
    expect(store.addNode('start', { x: 0, y: 0 })).toBe('start-1');
    expect(store.nodes()).toHaveLength(3);
  });

  it('moves only the given nodes', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('step', { x: 5, y: 5 });
    store.moveNodes([{ id: 'step-1', position: { x: 50, y: 60 } }]);
    expect(store.nodes().map((n) => n.position)).toEqual([
      { x: 50, y: 60 },
      { x: 5, y: 5 },
    ]);
  });

  it('connects nodes but rejects self-loops, duplicates and unknown nodes', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('step', { x: 0, y: 0 });
    expect(store.connect('step-1', 'step-2')).toBe('edge-1');
    expect(store.connect('step-1', 'step-2')).toBeNull();
    expect(store.connect('step-1', 'step-1')).toBeNull();
    expect(store.connect('step-1', 'nope')).toBeNull();
    expect(store.connect('step-1', 'step-2', 'compensation')).toBe('edge-2');
    expect(store.edges()).toHaveLength(2);
  });

  it('records the ports an edge attaches to', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('step', { x: 0, y: 0 });
    store.connect('step-1', 'step-2', 'forward', { sourcePort: 's', targetPort: 'nw' });
    expect(store.edges()[0]).toMatchObject({ sourcePort: 's', targetPort: 'nw' });
    store.addConnectedNode('step-2', 'end', { x: 0, y: 0 }, { sourcePort: 'e', targetPort: 'w' });
    expect(store.edges()[1]).toMatchObject({ target: 'end-1', sourcePort: 'e', targetPort: 'w' });
  });

  it('rejects edges out of end nodes or into start nodes', () => {
    store.addNode('start', { x: 0, y: 0 });
    store.addNode('end', { x: 0, y: 0 });
    store.addNode('step', { x: 0, y: 0 });
    expect(store.connect('end-1', 'step-1')).toBeNull();
    expect(store.connect('step-1', 'start-1')).toBeNull();
    expect(store.edges()).toHaveLength(0);
  });

  it('adds a connected node as a single undo step', () => {
    store.addNode('step', { x: 0, y: 0 });
    expect(store.addConnectedNode('step-1', 'step', { x: 200, y: 0 })).toBe('step-2');
    expect(store.nodes().at(-1)).toMatchObject({ id: 'step-2', position: { x: 200, y: 0 } });
    expect(store.edges()).toEqual([
      { id: 'edge-1', source: 'step-1', target: 'step-2', kind: 'forward' },
    ]);
    store.undo();
    expect(store.nodes()).toHaveLength(1);
    expect(store.edges()).toHaveLength(0);
  });

  it('rejects connected nodes from unknown sources, end nodes or to start nodes', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('end', { x: 0, y: 0 });
    expect(store.addConnectedNode('nope', 'step', { x: 0, y: 0 })).toBeNull();
    expect(store.addConnectedNode('end-1', 'step', { x: 0, y: 0 })).toBeNull();
    expect(store.addConnectedNode('step-1', 'start', { x: 0, y: 0 })).toBeNull();
    expect(store.nodes()).toHaveLength(2);
    expect(store.canUndo()).toBe(true);
    store.undo();
    store.undo();
    expect(store.canUndo()).toBe(false);
  });

  it('removing a node removes its edges', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('step', { x: 0, y: 0 });
    store.connect('step-1', 'step-2');
    store.connect('step-2', 'step-3');
    store.remove({ nodeIds: ['step-2'] });
    expect(store.nodes().map((n) => n.id)).toEqual(['step-1', 'step-3']);
    expect(store.edges()).toEqual([]);
  });

  it('removes edges by id', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.addNode('step', { x: 0, y: 0 });
    store.connect('step-1', 'step-2');
    store.remove({ edgeIds: ['edge-1'] });
    expect(store.edges()).toEqual([]);
    expect(store.nodes()).toHaveLength(2);
  });

  it('updates a node and can undo it', () => {
    store.addNode('step', { x: 0, y: 0 });
    store.updateNode('step-1', { name: 'Reserve stock', timeout: '30s' });
    expect(store.nodes()[0]).toMatchObject({ name: 'Reserve stock', timeout: '30s' });
    store.undo();
    expect(store.nodes()[0].name).toBe('Step');
  });

  describe('history', () => {
    it('undoes and redoes each edit as one step', () => {
      store.addNode('step', { x: 0, y: 0 });
      store.addNode('step', { x: 0, y: 0 });
      store.moveNodes([
        { id: 'step-1', position: { x: 9, y: 9 } },
        { id: 'step-2', position: { x: 8, y: 8 } },
      ]);
      expect(store.canUndo()).toBe(true);

      store.undo();
      expect(store.nodes().map((n) => n.position)).toEqual([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]);
      store.undo();
      expect(store.nodes()).toHaveLength(1);
      expect(store.canRedo()).toBe(true);

      store.redo();
      store.redo();
      expect(store.nodes().map((n) => n.position.x)).toEqual([9, 8]);
      expect(store.canRedo()).toBe(false);
    });

    it('a new edit clears the redo stack', () => {
      store.addNode('step', { x: 0, y: 0 });
      store.undo();
      store.addNode('end', { x: 0, y: 0 });
      expect(store.canRedo()).toBe(false);
    });

    it('rejected edits and empty removals do not create history', () => {
      store.addNode('step', { x: 0, y: 0 });
      store.undo();
      expect(store.canUndo()).toBe(false);
      store.addNode('step', { x: 0, y: 0 });
      store.connect('step-1', 'step-1');
      store.remove({});
      store.undo();
      expect(store.nodes()).toEqual([]);
    });

    it('load() resets history', () => {
      store.addNode('step', { x: 0, y: 0 });
      store.load({ nodes: [], edges: [] });
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });

    it('undo/redo are no-ops on empty history', () => {
      store.undo();
      store.redo();
      expect(store.nodes()).toEqual([]);
    });
  });
});
