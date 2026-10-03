import { Injectable, computed, inject, signal } from '@angular/core';
import { decisionIds, layoutDiagram } from '@ariadne/core';
import { DiagramStore } from '../model/diagram-store';

/** Layout of the store's diagram; recalculated after every change (incl. undo/redo). */
@Injectable()
export class DiagramLayout {
  private readonly store = inject(DiagramStore);
  /** Ids of nodes whose description is unfolded. View state: not saved, not undoable. */
  private readonly _expanded = signal<ReadonlySet<string>>(new Set());
  private readonly result = computed(() => layoutDiagram(this.store.diagram(), this._expanded()));

  readonly expanded = this._expanded.asReadonly();

  toggleExpanded(id: string): void {
    this._expanded.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  readonly positions = computed(() => this.result().positions);
  readonly slots = computed(() => this.result().slots);
  readonly labels = computed(() => this.result().labels);
  readonly routes = computed(() => this.result().routes);
  /** Ids of states that several transitions leave: shown as decisions. */
  readonly decisions = computed(() => {
    return decisionIds(this.store.diagram());
  });
}
