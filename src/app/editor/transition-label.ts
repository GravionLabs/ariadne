import { Component, computed, input, output } from '@angular/core';
import { DiagramEdge, Direction, EventKind, NodeType, eventLabel } from '../model/diagram';
import { AddStepButton } from './add-step-button';
import { LABEL_PADDING, LABEL_ROW, labelRows } from './diagram-layout';
import { Icon, IconName } from './icon';
import { INSERT_TYPES } from './node-types';

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
    '[class.floating]': '!insertable()',
  },
  templateUrl: './transition-label.html',
  styleUrl: './transition-label.scss',
})
export class TransitionLabel {
  readonly edge = input.required<DiagramEdge>();
  readonly direction = input.required<Direction>();
  readonly selected = input(false);
  /** Where the event comes from: the saga itself, outside it, or a timeout firing. */
  readonly kind = input<EventKind>();
  /** Compensation transitions are not laid out and get no "+". */
  readonly insertable = input(true);
  readonly selectRequested = output<void>();
  readonly inserted = output<NodeType>();

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
