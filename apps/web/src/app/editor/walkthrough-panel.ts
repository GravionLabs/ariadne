import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { Icon } from './icon';
import { NODE_TYPES } from './node-types';
import { WalkthroughStore } from './walkthrough-store';
import { DiagramEdge, eventLabel } from '@ariadne/core';

/**
 * Step-through for a review: the saga starts in its initial state, you pick the event that
 * happens, it follows that transition and shows what the next state does. Read-only; the path
 * can be copied as text.
 */
@Component({
  selector: 'app-walkthrough-panel',
  imports: [Icon],
  host: { role: 'region', 'aria-label': 'Walkthrough' },
  templateUrl: './walkthrough-panel.html',
  styleUrl: './walkthrough-panel.scss',
})
export class WalkthroughPanel {
  protected readonly walk = inject(WalkthroughStore);
  private readonly store = inject(DiagramStore);
  private readonly window = inject(DOCUMENT).defaultView;

  readonly closed = output<void>();

  protected readonly copied = signal(false);
  protected readonly failed = signal(false);

  protected readonly type = computed(() => {
    const node = this.walk.current();
    return node ? NODE_TYPES[node.type].label : '';
  });

  /** The path so far: the initial state, then each transition taken and where it led. */
  protected readonly steps = computed(() => {
    const path = this.walk.path() ?? [];
    return this.walk.steps().map((id, i) => ({
      edge: this.store.diagram().edges.find((e) => e.id === id)!,
      to: path[i + 1],
    }));
  });

  protected readonly initial = computed(() => this.walk.path()?.[0]);

  protected label(edge: DiagramEdge): string {
    return eventLabel(edge) || '(no event)';
  }

  protected targetName(edge: DiagramEdge): string {
    return this.store.nodes().find((n) => n.id === edge.target)?.name ?? edge.target;
  }

  /** Whether a transition applies in every state (it leaves the Any node). */
  protected fromAny(edge: DiagramEdge): boolean {
    return this.store.nodes().find((n) => n.id === edge.source)?.type === 'any';
  }

  protected async copy(): Promise<void> {
    this.failed.set(false);
    try {
      const clipboard = this.window?.navigator.clipboard;
      if (!clipboard) throw new Error('The clipboard is not available in this browser.');
      await clipboard.writeText(this.walk.text());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.failed.set(true);
    }
  }
}
