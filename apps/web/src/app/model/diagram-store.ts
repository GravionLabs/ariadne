import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { EditorHost } from '../host/editor-host';
import { DEFAULT_HISTORY_LIMIT, withUndoRedo } from './with-undo-redo';
import {
  DetailsPatch,
  Diagram,
  Direction,
  Spacing,
  EdgeKind,
  EdgePatch,
  EventInfoPatch,
  edits,
  emptyDiagram,
  MessageKind,
  NewStateInit,
  NodePatch,
  SagaPatch,
  NodeType,
  renameMessage,
  serializeDiagram,
} from '@ariadne/core';

export type { DetailsPatch, EdgePatch, EventInfoPatch, NewStateInit, NodePatch, SagaPatch };

/** App-owned diagram state (f-flow's "classic" mode): all edits go through this store. */
export const DiagramStore = signalStore(
  { providedIn: 'root' },
  withState<{ diagram: Diagram }>({ diagram: emptyDiagram() }),
  // The host of an embedded editor undoes on the document, so there is one history, not two.
  withUndoRedo<'diagram', Diagram>('diagram', {
    limit: () => (inject(EditorHost).embedded ? 0 : DEFAULT_HISTORY_LIMIT),
  }),
  withComputed(({ diagram }) => ({
    nodes: computed(() => diagram().nodes),
    edges: computed(() => diagram().edges),
    direction: computed(() => diagram().direction),
    spacing: computed((): Spacing => diagram().spacing ?? 'normal'),
  })),
  withMethods((store) => {
    /** Applies an edit that creates something as one undo step; `null` leaves the store alone. */
    const create = (edit: edits.Created | null): string | null => {
      if (!edit) return null;
      // An edit that changed nothing (the one "any" node already exists) is not an undo step.
      if (edit.diagram !== store.diagram()) store._commit(() => edit.diagram);
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
       * `init` names the node and gives the new transition its event, in the same undo step.
       */
      appendNode(source: string, type: NodeType, init?: NewStateInit): string | null {
        return create(edits.appendNode(store.diagram(), source, type, init));
      },

      /**
       * Splits edge A→B into A→X→B with a new state X (see `insertOnEdge` in `diagram-edits`).
       * Returns the new node id, or `null` if the edge is unknown or `type` cannot sit on a path.
       */
      insertOnEdge(edgeId: string, type: NodeType, init?: NewStateInit): string | null {
        return create(edits.insertOnEdge(store.diagram(), edgeId, type, init));
      },

      updateNode(id: string, patch: NodePatch): void {
        store._commit((d) => edits.updateNode(d, id, patch));
      },

      updateEdge(id: string, patch: EdgePatch): void {
        store._commit((d) => edits.updateEdge(d, id, patch));
      },

      /** Sets the saga's name and/or description as one undo step; no change, no step. */
      setDetails(patch: DetailsPatch): void {
        const next = edits.updateDetails(store.diagram(), patch);
        const current = store.diagram();
        if (next.name === current.name && next.description === current.description) return;
        store._commit(() => next);
      },

      /**
       * Points a transition at another state, as one undo step. Returns `false` if that is not
       * allowed (see `retargetEdge`); an unchanged target is allowed and records nothing.
       */
      setEdgeTarget(edgeId: string, target: string): boolean {
        const next = edits.retargetEdge(store.diagram(), edgeId, target);
        if (!next) return false;
        if (next !== store.diagram()) store._commit(() => next);
        return true;
      },

      /**
       * Renames a command or event everywhere it is used, as one undo step. Returns `false`
       * (and records nothing) if the new name is empty or already used by another message.
       */
      renameMessage(kind: MessageKind, from: string, to: string): boolean {
        const next = renameMessage(store.diagram(), kind, from, to);
        if (!next) return false;
        store._commit(() => next);
        return true;
      },

      /** Sets fields of the saga's code metadata (class, namespace, …) as one undo step. */
      setSaga(patch: SagaPatch): void {
        const next = edits.updateSaga(store.diagram(), patch);
        if (JSON.stringify(next.saga) === JSON.stringify(store.diagram().saga)) return;
        store._commit(() => next);
      },

      /** Sets the message type and/or correlation of an event, shared by its transitions. */
      setEventInfo(name: string, patch: EventInfoPatch): void {
        const next = edits.updateEventInfo(store.diagram(), name, patch);
        if (JSON.stringify(next.events) === JSON.stringify(store.diagram().events)) return;
        store._commit(() => next);
      },

      setDirection(direction: Direction): void {
        if (direction === store.diagram().direction) return;
        store._commit((d) => ({ ...d, direction }));
      },

      /** Room between states and layers; `normal` is stored as no value (#113). */
      setSpacing(spacing: Spacing): void {
        if (spacing === (store.diagram().spacing ?? 'normal')) return;
        store._commit((d) => {
          const next: Diagram = { ...d, spacing };
          if (spacing === 'normal') delete next.spacing;
          return next;
        });
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
