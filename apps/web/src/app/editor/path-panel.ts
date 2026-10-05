import { Component, computed, inject, output } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { Icon } from './icon';
import { PATH_VIEWS, PathStore } from './path-store';

/**
 * Shows the path a saga instance took: paste the steps it went through (the events it received) and
 * the diagram shows the states visited, the transitions taken and where the instance stands.
 * Read-only; a way to try the viewer's path view and to attach a trace to a review.
 */
@Component({
  selector: 'app-path-panel',
  imports: [Icon],
  host: { role: 'region', 'aria-label': 'Path of an instance' },
  templateUrl: './path-panel.html',
  styleUrl: './path-panel.scss',
})
export class PathPanel {
  protected readonly path = inject(PathStore);
  private readonly store = inject(DiagramStore);

  readonly closed = output<void>();

  protected readonly views = PATH_VIEWS;

  protected readonly example =
    '- OrderReceived\n- StockReserved\n- { event: PaymentFailed, note: card declined }';

  private readonly names = computed(() => new Map(this.store.nodes().map((n) => [n.id, n.name])));

  protected readonly summary = computed(() => {
    const r = this.path.result();
    if (!r) return '';
    const taken = r.transitions.length;
    const steps = `${taken} step${taken === 1 ? '' : 's'}`;
    const where = this.names().get(r.current ?? '') ?? '';
    return r.finished ? `Finished in ${where} after ${steps}.` : `Now in ${where} after ${steps}.`;
  });

  /** The steps that were resolved: its number, what happened and where it led. */
  protected readonly steps = computed(() =>
    (this.path.result()?.transitions ?? []).map((t) => ({
      number: t.index + 1,
      what: t.step.event ?? `to ${t.step.state ?? t.step.to}`,
      to: this.names().get(t.to) ?? t.to,
      note: [t.step.at, t.step.note].filter(Boolean).join(' · '),
    })),
  );

  protected onInput(event: Event): void {
    this.path.setText((event.target as HTMLTextAreaElement).value);
  }
}
