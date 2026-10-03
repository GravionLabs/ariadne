import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { DiagramStore } from '../model/diagram-store';

interface EditorState {
  nodeIds: string[];
  edgeIds: string[];
  /** Set when the next layout should be fitted into view (new file, layout option change). */
  fitPending: boolean;
  /** Node to select in f-flow once the layout has placed it. */
  pendingSelect: string | null;
}

const initialState: EditorState = {
  nodeIds: [],
  edgeIds: [],
  fitPending: false,
  pendingSelect: null,
};

/**
 * Editor UI state that other components read: the selection, what is derived from it, and what
 * the canvas still has to do after the next layout. Provided by `Editor`, so every open editor
 * has its own.
 */
export const EditorStore = signalStore(
  withState(initialState),
  withComputed(({ nodeIds, edgeIds }) => {
    const diagram = inject(DiagramStore);
    return {
      selection: computed(() => ({ nodeIds: nodeIds(), edgeIds: edgeIds() })),
      hasSelection: computed(() => nodeIds().length + edgeIds().length > 0),
      /** The selected node if exactly one node (and nothing else) is selected. */
      selectedNode: computed(() =>
        nodeIds().length === 1 && edgeIds().length === 0
          ? diagram.nodes().find((n) => n.id === nodeIds()[0])
          : undefined,
      ),
      /** The selected edge if exactly one edge (and nothing else) is selected. */
      selectedEdge: computed(() =>
        edgeIds().length === 1 && nodeIds().length === 0
          ? diagram.edges().find((e) => e.id === edgeIds()[0])
          : undefined,
      ),
    };
  }),
  withComputed(({ selectedNode, selectedEdge }) => ({
    /** The inspector shows while a single state or transition is selected. */
    inspectorOpen: computed(() => !!selectedNode() || !!selectedEdge()),
  })),
  withMethods((store) => ({
    /** The canvas reported a new selection (or it was replaced from code). */
    setSelection(nodeIds: string[], edgeIds: string[]): void {
      patchState(store, { nodeIds, edgeIds });
    },

    clearSelection(): void {
      patchState(store, { nodeIds: [], edgeIds: [] });
    },

    selectEdge(id: string): void {
      patchState(store, { nodeIds: [], edgeIds: [id] });
    },

    /** Selects a node that may not be on the canvas yet: f-flow gets it after the next layout. */
    selectNode(id: string): void {
      patchState(store, { nodeIds: [id], edgeIds: [], pendingSelect: id });
    },

    requestFit(): void {
      patchState(store, { fitPending: true });
    },

    /** What the canvas has to do after the layout, now done: returns it and clears it. */
    takePending(): { fit: boolean; select: string | null } {
      const pending = { fit: store.fitPending(), select: store.pendingSelect() };
      patchState(store, { fitPending: false, pendingSelect: null });
      return pending;
    },
  })),
);

export type EditorStore = InstanceType<typeof EditorStore>;
