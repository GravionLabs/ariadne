import { Component, computed, input, output } from '@angular/core';
import { EFConnectableSide, FFlowModule } from '@foblex/flow';
import { Icon } from './icon';
import { DECISION, NODE_TYPES } from './node-types';
import {
  ACTIVITY_VERBS,
  canExpand,
  DiagramNode,
  Direction,
  hasInput,
  hasOutput,
  inputId,
  isBar,
  isCompact,
  outputId,
  Severity,
} from '@ariadne/core';

/**
 * A state on the canvas. The host carries `fNode` (sized with `fNodeSize`, as f-flow owns the
 * host's inline style); this draws the card and its two connectors.
 */
/** Where a state's connectors sit: in on the upstream side, out on the downstream side. */
export const SIDES: Readonly<Record<Direction, { in: EFConnectableSide; out: EFConnectableSide }>> =
  {
    'top-bottom': { in: EFConnectableSide.TOP, out: EFConnectableSide.BOTTOM },
    'bottom-top': { in: EFConnectableSide.BOTTOM, out: EFConnectableSide.TOP },
    'left-right': { in: EFConnectableSide.LEFT, out: EFConnectableSide.RIGHT },
    'right-left': { in: EFConnectableSide.RIGHT, out: EFConnectableSide.LEFT },
  };

@Component({
  selector: 'app-node-card',
  imports: [FFlowModule, Icon],
  host: {
    '[attr.data-type]': "decision() ? 'decision' : node().type",
    '[attr.data-color]': 'palette()',
    '[style.--node-color]': 'custom()',
    '[class.compact]': 'compact()',
    '[class.bar]': 'bar()',
    '[attr.data-finding]': 'finding() ?? null',
    '[attr.data-highlight]': 'highlight() ?? null',
    '[attr.data-badge]': 'badge() ?? null',
    '[attr.title]': 'open() ? null : node().description || null',
  },
  templateUrl: './node-card.html',
  styleUrl: './node-card.scss',
})
export class NodeCard {
  readonly node = input.required<DiagramNode>();
  readonly direction = input.required<Direction>();
  /** Emphasised (`on`) or faded (`off`) while a message or a step is being looked at. */
  readonly highlight = input<'on' | 'off'>();
  /** A short note on the corner, e.g. how often an instance visited the state (the path view). */
  readonly badge = input<string>();
  /** The worst problem found with this node, shown as a marker. */
  readonly finding = input<Severity>();
  /** For a join: the events of the transitions leading into it. */
  readonly events = input<readonly string[]>([]);
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
  protected readonly bar = computed(() => isBar(this.node()));
  protected readonly compact = computed(() => isCompact(this.node()) && !this.bar());
  protected readonly verbs = ACTIVITY_VERBS;
  protected readonly hasInput = computed(() => hasInput(this.node().type));
  protected readonly hasOutput = computed(() => hasOutput(this.node().type));
  protected readonly inputId = computed(() => inputId(this.node().id));
  protected readonly outputId = computed(() => outputId(this.node().id));
  /** In on the upstream side, out on the downstream side, in all four directions (#113). */
  protected readonly inSide = computed(() => SIDES[this.direction()].in);
  protected readonly outSide = computed(() => SIDES[this.direction()].out);
}
