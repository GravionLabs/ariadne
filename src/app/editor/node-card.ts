import { Component, computed, input, output } from '@angular/core';
import { EFConnectableSide, FFlowModule } from '@foblex/flow';
import { DiagramNode, Direction, hasInput, hasOutput, inputId, outputId } from '../model/diagram';
import { canExpand } from './diagram-layout';
import { Icon } from './icon';
import { DECISION, NODE_TYPES } from './node-types';

/**
 * A state on the canvas. The host carries `fNode` (sized with `fNodeSize`, as f-flow owns the
 * host's inline style); this draws the card and its two connectors.
 */
@Component({
  selector: 'app-node-card',
  imports: [FFlowModule, Icon],
  host: {
    '[attr.data-type]': "decision() ? 'decision' : node().type",
    '[attr.data-color]': 'palette()',
    '[style.--node-color]': 'custom()',
    '[class.compact]': 'compact()',
    '[attr.title]': 'open() ? null : node().description || null',
  },
  templateUrl: './node-card.html',
  styleUrl: './node-card.scss',
})
export class NodeCard {
  readonly node = input.required<DiagramNode>();
  readonly direction = input.required<Direction>();
  /** Several transitions leave this state: it is drawn as a decision. */
  readonly decision = input(false);
  /** The description is unfolded under the heading. */
  readonly expanded = input(false);
  readonly expandToggled = output<void>();

  protected readonly palette = computed(() => {
    const c = this.node().color;
    return c && !c.startsWith('#') ? c : null;
  });
  protected readonly custom = computed(() => {
    const c = this.node().color;
    return c?.startsWith('#') ? c : null;
  });
  protected readonly canExpand = computed(() => canExpand(this.node()));
  protected readonly open = computed(() => this.canExpand() && this.expanded());
  protected readonly info = computed(() =>
    this.decision() ? DECISION : NODE_TYPES[this.node().type],
  );
  protected readonly compact = computed(() => ['start', 'end'].includes(this.node().type));
  protected readonly hasInput = computed(() => hasInput(this.node().type));
  protected readonly hasOutput = computed(() => hasOutput(this.node().type));
  protected readonly inputId = computed(() => inputId(this.node().id));
  protected readonly outputId = computed(() => outputId(this.node().id));
  protected readonly inSide = computed(() =>
    this.direction() === 'left-right' ? EFConnectableSide.LEFT : EFConnectableSide.TOP,
  );
  protected readonly outSide = computed(() =>
    this.direction() === 'left-right' ? EFConnectableSide.RIGHT : EFConnectableSide.BOTTOM,
  );
}
