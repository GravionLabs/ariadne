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
});
