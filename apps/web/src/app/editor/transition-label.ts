import { Component, computed, input, output } from '@angular/core';
import { AddStepButton, NewStep } from './add-step-button';
import { Icon, IconName } from './icon';
import { INSERT_TYPES } from './node-types';
import {
  DiagramEdge,
  Direction,
  EventKind,
  eventLabel,
  LABEL_PADDING,
  LABEL_ROW,
  labelRows,
  Severity,
} from '@ariadne/core';

/**
 * The label on a transition: the event that triggers it (and where an external one comes from),
 * plus a "+" that inserts a state into it. Clicking the card selects the transition. What the saga
 * does on the way is shown on the state the transition leads into.
 */
@Component({
  selector: 'app-transition-label',
  imports: [AddStepButton, Icon],
  host: {
    '[attr.data-direction]': 'direction()',
    '[class.empty]': 'rows() === 0',
    '[class.inline]': '!insertable()',
    '[attr.data-highlight]': 'highlight() ?? null',
    '[attr.data-badge]': 'badge() ?? null',
  },
  templateUrl: './transition-label.html',
  styleUrl: './transition-label.scss',
})
export class TransitionLabel {
  readonly edge = input.required<DiagramEdge>();
  readonly direction = input.required<Direction>();
  readonly selected = input(false);
  /** Emphasised (`on`) or faded (`off`), like the states. */
  readonly highlight = input<'on' | 'off'>();
  /** A short note on the corner: the numbers of the steps that took it (the path view). */
  readonly badge = input<string>();
  /** The worst problem found with this transition: its card gets a coloured edge. */
  readonly finding = input<Severity>();
  /** Where the event comes from: the saga itself, outside it, or a timeout firing. */
  readonly kind = input<EventKind>();
  /** Compensation transitions are not laid out and get no "+". */
  readonly insertable = input(true);
  readonly selectRequested = output<void>();
  readonly inserted = output<NewStep>();

  protected readonly insertTypes = INSERT_TYPES;
  protected readonly icon = computed<IconName>(() => {
    switch (this.kind()) {
      case 'timeout':
        return 'clock';
      case 'reply':
        return 'reply';
      case 'fault':
        return 'fault';
      case 'composite':
        return 'join';
      case 'slipCompleted':
        return 'route';
      case 'slipFaulted':
        return 'compensation';
      default:
        return 'trigger';
    }
  });
  protected readonly hint = computed(() => {
    const source = this.edge().eventSource;
    switch (this.kind()) {
      case 'timeout':
        return 'A timeout fires';
      case 'reply':
        return 'The reply to a request';
      case 'fault':
        return 'A request faulted';
      case 'composite':
        return 'All the events of a join have arrived';
      case 'slipCompleted':
        return 'Every activity of the routing slip ran';
      case 'slipFaulted':
        return 'The routing slip faulted, and what ran was compensated';
      case 'external':
        return 'External event' + (source ? ' from ' + source : '');
      default:
        return 'Event published by this saga';
    }
  });
  protected readonly label = computed(() => eventLabel(this.edge()));
  protected readonly rows = computed(() => labelRows(this.edge()));
  protected readonly cardHeight = computed(() => this.rows() * LABEL_ROW + 2 * LABEL_PADDING);
}
