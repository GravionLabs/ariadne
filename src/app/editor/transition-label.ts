import { Component, computed, input, output } from '@angular/core';
import { DiagramEdge, Direction, NodeType } from '../model/diagram';
import { AddStepButton } from './add-step-button';
import { LABEL_PADDING, LABEL_ROW, labelRows } from './diagram-layout';
import { Icon } from './icon';
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
  /** The saga does not publish the event itself: it comes from outside. */
  readonly external = input(false);
  /** Compensation transitions are not laid out and get no "+". */
  readonly insertable = input(true);
  readonly selectRequested = output<void>();
  readonly inserted = output<NodeType>();

  protected readonly insertTypes = INSERT_TYPES;
  protected readonly rows = computed(() => labelRows(this.edge()));
  protected readonly cardHeight = computed(() => this.rows() * LABEL_ROW + 2 * LABEL_PADDING);
}
