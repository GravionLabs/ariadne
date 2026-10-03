import { TestBed } from '@angular/core/testing';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { describe, expect, it } from 'vitest';
import { withUndoRedo } from './with-undo-redo';

interface Counter {
  n: number;
}

function createStore(limit?: number) {
  const Store = signalStore(
    withState<{ value: Counter }>({ value: { n: 0 } }),
    withUndoRedo<'value', Counter>('value', { limit }),
    withMethods((store) => ({
      set: (n: number) => store._commit(() => ({ n })),
      load: (n: number) => {
        patchState(store, { value: { n } });
        store._resetHistory();
      },
    })),
  );
  TestBed.configureTestingModule({ providers: [Store] });
  return TestBed.inject(Store);
}

describe('withUndoRedo', () => {
  it('starts with nothing to undo or redo', () => {
    const store = createStore();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('records each commit as one undo step', () => {
    const store = createStore();
    store.set(1);
    store.set(2);
    expect(store.value()).toEqual({ n: 2 });
    store.undo();
    expect(store.value()).toEqual({ n: 1 });
    store.undo();
    expect(store.value()).toEqual({ n: 0 });
    expect(store.canUndo()).toBe(false);
  });

  it('redoes undone steps', () => {
    const store = createStore();
    store.set(1);
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.value()).toEqual({ n: 1 });
    expect(store.canRedo()).toBe(false);
  });

  it('clears redo on a new edit', () => {
    const store = createStore();
    store.set(1);
    store.undo();
    store.set(5);
    expect(store.canRedo()).toBe(false);
  });

  it('ignores undo and redo with an empty history', () => {
    const store = createStore();
    store.undo();
    store.redo();
    expect(store.value()).toEqual({ n: 0 });
  });

  it('keeps the previous value by identity', () => {
    const store = createStore();
    const initial = store.value();
    store.set(1);
    store.undo();
    expect(store.value()).toBe(initial);
  });

  it('limits the history, dropping the oldest steps', () => {
    const store = createStore(3);
    for (let n = 1; n <= 5; n++) store.set(n);
    for (let i = 0; i < 10; i++) store.undo();
    expect(store.value()).toEqual({ n: 2 });
  });

  it('keeps 100 steps by default', () => {
    const store = createStore();
    for (let n = 1; n <= 150; n++) store.set(n);
    for (let i = 0; i < 200; i++) store.undo();
    expect(store.value()).toEqual({ n: 50 });
  });

  it('forgets history on reset', () => {
    const store = createStore();
    store.set(1);
    store.undo();
    store.load(9);
    expect(store.value()).toEqual({ n: 9 });
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });
});
