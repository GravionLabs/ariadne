import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { MessageKind } from '../model/diagram';
import { MessageEntry, buildCatalog } from '../model/catalog';
import { DiagramStore } from '../model/diagram-store';
import { EditorStore } from './editor-store';
import { Icon } from './icon';

const ORIGINS: Record<string, string> = {
  internal: 'Published by the saga',
  external: 'From outside',
  timeout: 'Timeout',
  reply: 'Reply to a request',
  fault: 'Fault of a request',
  composite: 'All events of a join',
};

type Filter = 'all' | MessageKind;

/**
 * Every command and event of the saga: where it comes from, which states send or publish it and
 * which transitions react to it. Picking one emphasises those states and transitions on the
 * canvas; renaming one renames it everywhere.
 */
@Component({
  selector: 'app-catalog-panel',
  imports: [Icon],
  host: { role: 'region', 'aria-label': 'Messages' },
  templateUrl: './catalog-panel.html',
  styleUrl: './catalog-panel.scss',
})
export class CatalogPanel {
  private readonly store = inject(DiagramStore);
  private readonly editor = inject(EditorStore);

  readonly closed = output<void>();

  protected readonly filter = signal<Filter>('all');
  protected readonly query = signal('');
  protected readonly picked = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly origins = ORIGINS;

  protected readonly catalog = computed(() => buildCatalog(this.store.diagram()));
  protected readonly entries = computed(() => {
    const filter = this.filter();
    const query = this.query().trim().toLowerCase();
    return this.catalog().filter(
      (m) =>
        (filter === 'all' || m.kind === filter) && (!query || m.name.toLowerCase().includes(query)),
    );
  });
  protected readonly counts = computed(() => ({
    command: this.catalog().filter((m) => m.kind === 'command').length,
    event: this.catalog().filter((m) => m.kind === 'event').length,
  }));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.editor.clearHighlight());
  }

  protected key = (m: MessageEntry): string => `${m.kind}:${m.name}`;

  /** Emphasise what the message touches, or let go of it when it is picked again. */
  protected pick(entry: MessageEntry): void {
    this.error.set(null);
    if (this.picked() === this.key(entry)) {
      this.picked.set(null);
      this.editor.clearHighlight();
    } else {
      this.picked.set(this.key(entry));
      this.editor.setHighlight(entry.nodeIds, entry.edgeIds);
    }
  }

  protected setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected rename(entry: MessageEntry, event: Event): void {
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (name === entry.name) return;
    if (this.store.renameMessage(entry.kind, entry.name, name)) {
      this.error.set(null);
      // The entry moves with its new name: keep looking at it.
      if (this.picked() === this.key(entry)) {
        this.picked.set(`${entry.kind}:${name}`);
      }
      return;
    }
    field.value = entry.name;
    this.error.set(
      name === ''
        ? 'A message needs a name.'
        : `There is already a ${entry.kind} called “${name}”.`,
    );
  }

  protected producerName = (p: { name: string }): string => p.name;
  protected reactionText = (r: { from: string; to: string }): string => `${r.from} → ${r.to}`;

  protected selectedHighlight = (entry: MessageEntry): boolean => this.picked() === this.key(entry);
}
