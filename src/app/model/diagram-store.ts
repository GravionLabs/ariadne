import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Diagram, Direction, EdgeKind, NodeType, emptyDiagram } from './diagram';
import * as edits from './diagram-edits';
import { EdgePatch, NodePatch } from './diagram-edits';
import { serializeDiagram } from './diagram-yaml';
import { withUndoRedo } from './with-undo-redo';

export type { EdgePatch, NodePatch };

/** App-owned diagram state (f-flow's "classic" mode): all edits go through this store. */
export const DiagramStore = signalStore(
  { providedIn: 'root' },
  withState<{ diagram: Diagram }>({ diagram: emptyDiagram() }),
  withUndoRedo<'diagram', Diagram>('diagram'),
  withComputed(({ diagram }) => ({
    nodes: computed(() => diagram().nodes),
    edges: computed(() => diagram().edges),
    direction: computed(() => diagram().direction),
  })),
  withMethods((store) => {
    /** Applies an edit that creates something as one undo step; `null` leaves the store alone. */
    const create = (edit: edits.Created | null): string | null => {
      if (!edit) return null;
      store._commit(() => edit.diagram);
      return edit.id;
    };

    return {
      /** Replaces the whole diagram (e.g. after opening a file) and clears the undo history. */
      load(diagram: Diagram): void {
        patchState(store, { diagram });
        store._resetHistory();
      },

      /**
       * Replaces the whole diagram as one undo step, e.g. after the source text was edited. Returns
       * `false`, without touching the history, when the new diagram is the same as the current one.
       */
      replace(diagram: Diagram): boolean {
        if (serializeDiagram(diagram) === serializeDiagram(store.diagram())) return false;
        store._commit(() => diagram);
        return true;
      },

      /** Adds an unconnected node, e.g. the start of an empty diagram. */
      addNode(type: NodeType): string {
        return create(edits.addNode(store.diagram(), type))!;
      },

      /**
       * Adds a node that follows `source`, connected by a forward edge, as a single undo step.
       * Returns the new node id, or `null` if `source` is unknown or the connection is not allowed.
       */
      appendNode(source: string, type: NodeType): string | null {
        return create(edits.appendNode(store.diagram(), source, type));
      },

      /**
       * Splits edge A→B into A→X→B with a new state X (see `insertOnEdge` in `diagram-edits`).
       * Returns the new node id, or `null` if the edge is unknown or `type` cannot sit on a path.
       */
      insertOnEdge(edgeId: string, type: NodeType): string | null {
        return create(edits.insertOnEdge(store.diagram(), edgeId, type));
      },

      updateNode(id: string, patch: NodePatch): void {
        store._commit((d) => edits.updateNode(d, id, patch));
      },

      updateEdge(id: string, patch: EdgePatch): void {
        store._commit((d) => edits.updateEdge(d, id, patch));
      },

      setDirection(direction: Direction): void {
        if (direction === store.diagram().direction) return;
        store._commit((d) => ({ ...d, direction }));
      },

      /** Connects two nodes; returns the new edge id, or `null` if the connection is not allowed. */
      connect(source: string, target: string, kind: EdgeKind = 'forward'): string | null {
        return create(edits.connect(store.diagram(), source, target, kind));
      },

      /**
       * Removes nodes (and every edge attached to them) and edges. Removing a single node that sits
       * on a path (one forward edge in, one out) closes the gap: A→X→B becomes A→B.
       */
      remove(selection: { nodeIds?: readonly string[]; edgeIds?: readonly string[] }): void {
        if (!selection.nodeIds?.length && !selection.edgeIds?.length) return;
        store._commit((d) => edits.removeElements(d, selection));
      },
    };
  }),
);

export type DiagramStore = InstanceType<typeof DiagramStore>;
