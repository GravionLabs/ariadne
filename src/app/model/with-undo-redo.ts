import { Signal, computed } from '@angular/core';
import {
  WritableStateSource,
  getState,
  patchState,
  signalStoreFeature,
  type,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

export const DEFAULT_HISTORY_LIMIT = 100;

export interface UndoRedoOptions {
  /** Most undo steps kept; the oldest are dropped first. */
  limit?: number;
}

interface History<T> {
  _past: T[];
  _future: T[];
}

/**
 * Undo/redo for one state slice, `key`, whose value is immutable (every change replaces it).
 *
 * - `_commit(change)` applies one edit as one undo step and clears redo.
 * - `_resetHistory()` forgets both stacks, e.g. after loading a file.
 * - `undo()`, `redo()`, `canUndo` and `canRedo` are public.
 */
export function withUndoRedo<K extends string, T extends object>(
  key: K,
  options: UndoRedoOptions = {},
) {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  type Tracked = { [P in K]: T };

  return signalStoreFeature(
    { state: type<Tracked>() },
    withState<History<T>>({ _past: [], _future: [] }),
    withComputed((store) => {
      // Underscore slices are private and hidden from the feature's types, but exist at runtime.
      const { _past, _future } = store as unknown as { [P in keyof History<T>]: Signal<T[]> };
      return {
        canUndo: computed(() => _past().length > 0),
        canRedo: computed(() => _future().length > 0),
      };
    }),
    withMethods((store) => {
      const tracked = store as unknown as WritableStateSource<Record<string, T>>;
      const history = store as unknown as WritableStateSource<History<T>>;
      const current = () => getState(tracked)[key];
      const stacks = () => getState(history);

      return {
        _commit(change: (value: T) => T): void {
          const before = current();
          patchState(tracked, { [key]: change(before) });
          patchState(history, ({ _past }) => ({
            _past: [..._past, before].slice(-limit),
            _future: [],
          }));
        },
        _resetHistory(): void {
          patchState(history, { _past: [], _future: [] });
        },
        undo(): void {
          const { _past, _future } = stacks();
          if (_past.length === 0) return;
          const before = current();
          patchState(tracked, { [key]: _past[_past.length - 1] });
          patchState(history, { _past: _past.slice(0, -1), _future: [before, ..._future] });
        },
        redo(): void {
          const { _past, _future } = stacks();
          const [next, ...rest] = _future;
          if (!next) return;
          const before = current();
          patchState(tracked, { [key]: next });
          patchState(history, { _past: [..._past, before], _future: rest });
        },
      };
    }),
  );
}
