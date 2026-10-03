import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { DiagramStore } from '../model/diagram-store';
import { doingsOf, follow, optionsAt, walkAsText } from '../model/walkthrough';

/**
 * Walking through the saga one event at a time: which state it is in, which events it reacts to,
 * and the path taken so far. Provided by `Editor`, like the rest of its state. The diagram is
 * read-only while walking; if it changes anyway (the source text) and the path no longer holds,
 * the walk ends.
 */
export const WalkthroughStore = signalStore(
  withState({ active: false, steps: [] as string[] }),
  withComputed(({ active, steps }) => {
    const diagram = inject(DiagramStore);
    const path = computed(() => (active() ? follow(diagram.diagram(), steps()) : null));
    const current = computed(() => path()?.at(-1));
    return {
      /** The states visited, starting with the initial one; `null` while not walking. */
      path,
      current,
      /** Whether the path still follows the diagram (it can stop doing so if the text changes). */
      valid: computed(() => !active() || path() !== null),
      /** The transitions that can be taken now. */
      options: computed(() => {
        const node = current();
        return node ? optionsAt(diagram.diagram(), node.id) : [];
      }),
      /** What entering the current state does. */
      doings: computed(() => {
        const node = current();
        return node ? doingsOf(node) : [];
      }),
      /** The transition taken last. */
      lastStep: computed(() => steps().at(-1)),
      text: computed(() => (active() ? walkAsText(diagram.diagram(), steps()) : '')),
    };
  }),
  withMethods((store) => ({
    /** Starts in the initial state. */
    start(): void {
      patchState(store, { active: true, steps: [] });
    },

    stop(): void {
      patchState(store, { active: false, steps: [] });
    },

    restart(): void {
      patchState(store, { steps: [] });
    },

    /** Takes a transition the current state offers. Returns `false` if it does not. */
    take(edgeId: string): boolean {
      if (!store.options().some((e) => e.id === edgeId)) return false;
      patchState(store, { steps: [...store.steps(), edgeId] });
      return true;
    },

    back(): void {
      patchState(store, { steps: store.steps().slice(0, -1) });
    },
  })),
);

export type WalkthroughStore = InstanceType<typeof WalkthroughStore>;
