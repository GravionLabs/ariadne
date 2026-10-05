import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { TimelineEntry, decisionIds } from '@ariadne/core';
import { describeTimeline } from '@ariadne/export';
import { DiagramStore } from '../model/diagram-store';
import { Icon, IconName } from './icon';
import { PathStore } from './path-store';

/** The icons of the canvas: of the event's kind on a step, of the node's type on a state. */
const EVENT_ICONS: Partial<Record<string, IconName>> = {
  timeout: 'clock',
  reply: 'reply',
  fault: 'fault',
  composite: 'join',
};

/**
 * The path of an instance as a timeline, left to right, under the canvas (#377): the states it went
 * through and the step that moved it between each two, as the viewer draws it. Each state and step is
 * a button that selects it on the diagram; the arrow keys move between them (one tab stop).
 */
@Component({
  selector: 'app-path-timeline',
  imports: [Icon],
  host: { role: 'region', 'aria-label': 'Timeline of the path' },
  templateUrl: './path-timeline.html',
  styleUrl: './path-timeline.scss',
})
export class PathTimeline {
  protected readonly path = inject(PathStore);
  private readonly store = inject(DiagramStore);
  /** States several transitions leave are decisions, drawn as on the canvas. */
  protected readonly decisions = computed(() => decisionIds(this.store.diagram()));

  /** A state (node id) or a step (edge id) was chosen: select it on the diagram. */
  readonly picked = output<string>();

  protected readonly entries = computed(() => this.path.timeline() ?? []);
  protected readonly description = computed(() => describeTimeline(this.entries()));
  /** The entry with the tab stop: the state the instance is in, until another is chosen. */
  private readonly chosen = signal<number | null>(null);
  protected readonly active = computed(() => {
    const entries = this.entries();
    const chosen = this.chosen();
    if (chosen !== null && chosen < entries.length && this.focusable(entries[chosen]))
      return chosen;
    const now = entries.findIndex((e) => e.kind === 'state' && e.status !== 'visited');
    return now >= 0 ? now : 0;
  });
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('button');

  constructor() {
    // The state the instance is in stays in view, also when the path is long.
    afterRenderEffect(() => {
      const index = this.active();
      const button = this.buttons().find((b) => Number(b.nativeElement.dataset['index']) === index);
      button?.nativeElement.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  protected icon(entry: TimelineEntry): IconName {
    if (entry.kind === 'step') return EVENT_ICONS[entry.eventKind ?? ''] ?? 'trigger';
    if (entry.kind !== 'state') return 'fault';
    if (this.decisions().has(entry.nodeId)) return 'decision';
    return entry.type === 'state' ? 'step' : entry.type;
  }

  protected visitNote(entry: TimelineEntry): string {
    if (entry.kind !== 'state') return '';
    return [
      entry.status === 'current' ? 'now' : entry.status === 'finished' ? 'finished' : '',
      entry.visit > 1 ? `${ordinal(entry.visit)} time` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected meta(entry: TimelineEntry): string {
    return entry.kind === 'step' ? [entry.at, entry.note].filter(Boolean).join(' · ') : '';
  }

  protected pick(index: number): void {
    const entry = this.entries()[index];
    if (!entry || !this.focusable(entry)) return;
    this.chosen.set(index);
    this.picked.emit(
      entry.kind === 'state' ? entry.nodeId : entry.kind === 'step' ? entry.edgeId : '',
    );
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const focusable = this.entries()
      .map((e, i) => (this.focusable(e) ? i : -1))
      .filter((i) => i >= 0);
    const at = focusable.indexOf(index);
    const target =
      event.key === 'ArrowRight'
        ? focusable[Math.min(at + 1, focusable.length - 1)]
        : event.key === 'ArrowLeft'
          ? focusable[Math.max(at - 1, 0)]
          : event.key === 'Home'
            ? focusable[0]
            : event.key === 'End'
              ? focusable.at(-1)
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    this.chosen.set(target);
    this.buttons()
      .find((b) => Number(b.nativeElement.dataset['index']) === target)
      ?.nativeElement.focus();
  }

  private focusable(entry: TimelineEntry): boolean {
    return entry.kind !== 'problem';
  }
}

function ordinal(k: number): string {
  const tens = k % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] ?? 'th');
  return `${k}${suffix}`;
}
