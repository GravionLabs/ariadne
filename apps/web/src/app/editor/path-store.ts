import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { DiagramStore } from '../model/diagram-store';
import { parsePathSteps, pathTimeline, resolvePath } from '@ariadne/core';

/** Where the path is shown: on the diagram (emphasis and step numbers), as a timeline, or both. */
export type PathView = 'diagram' | 'timeline' | 'both';
export const PATH_VIEWS: readonly { id: PathView; label: string }[] = [
  { id: 'diagram', label: 'On the diagram' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'both', label: 'Both' },
];

/**
 * The path a saga instance took, pasted as text (a list of events or steps) and drawn on the
 * diagram: the states visited, the transitions taken, the step numbers, where it stands now. The
 * same view as the `<ariadne-saga>` viewer's `path`. Provided by `Editor`; the diagram is read-only
 * while the view is open.
 */
export const PathStore = signalStore(
  withState({ active: false, text: '', view: 'both' as PathView }),
  withComputed(({ active, text, view }) => {
    const diagram = inject(DiagramStore);
    const parsed = computed(() => parsePathSteps(text()));
    const result = computed(() => {
      const p = parsed();
      return active() && 'steps' in p && p.steps.length
        ? resolvePath(diagram.diagram(), p.steps)
        : null;
    });
    const onDiagram = computed(() => !!result() && view() !== 'timeline');
    return {
      /** What is wrong with the pasted text, in words; `null` if it reads. */
      error: computed(() => {
        const p = parsed();
        return 'error' in p ? p.error : null;
      }),
      steps: computed(() => {
        const p = parsed();
        return 'steps' in p ? p.steps : [];
      }),
      /** The path resolved against the diagram; `null` while there is nothing to show. */
      result,
      /** The path is drawn on the diagram (not only as a timeline). */
      onDiagram,
      /** The states and steps of the path in order, left to right, while the timeline is shown. */
      timeline: computed(() => {
        const r = result();
        return r && view() !== 'diagram' ? pathTimeline(diagram.diagram(), r) : null;
      }),
      /** The states visited and the transitions taken, for emphasising them. */
      nodeIds: computed(() => [...new Set(result()?.nodes)]),
      edgeIds: computed(() => [...new Set(result()?.transitions.map((t) => t.edgeId))]),
      /** What to write on each state (`×2`) and transition (`2, 4`). */
      badges: computed(() => {
        const r = result();
        const badges = new Map<string, string>();
        if (!r || !onDiagram()) return badges;
        for (const [id, n] of Object.entries(r.visits)) badges.set(id, `×${n}`);
        for (const [id, steps] of Object.entries(r.stepNumbers)) badges.set(id, steps.join(', '));
        return badges;
      }),
    };
  }),
  withMethods((store) => ({
    start(): void {
      patchState(store, { active: true });
    },

    /** Closes the view; the pasted text stays for next time. */
    stop(): void {
      patchState(store, { active: false });
    },

    setText(text: string): void {
      patchState(store, { text });
    },

    setView(view: PathView): void {
      patchState(store, { view });
    },
  })),
);

export type PathStore = InstanceType<typeof PathStore>;
