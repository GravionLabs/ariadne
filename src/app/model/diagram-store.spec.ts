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
