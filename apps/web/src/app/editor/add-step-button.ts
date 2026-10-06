import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FFlowModule } from '@foblex/flow';
import { Icon } from './icon';
import { NewStateInit, NodeType, suggestEvents } from '@ariadne/core';
import { DiagramStore } from '../model/diagram-store';
import { StatePrompt } from './state-prompt';

/** A state to add: its type, and what the prompt asked for (nothing: the defaults). */
export interface NewStep {
  type: NodeType;
  init?: NewStateInit;
}

/**
 * Round "+" that opens one popover asking for the event and the name of a new state, with a switch
 * for the other types (join, final state); used after states and on transitions.
 */
@Component({
  selector: 'app-add-step-button',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, FFlowModule, Icon, StatePrompt],
  host: { '[class.open]': 'isOpen()' },
  templateUrl: './add-step-button.html',
  styleUrl: './add-step-button.scss',
})
export class AddStepButton {
  readonly types = input.required<readonly NodeType[]>();
  readonly label = input('Add a node');
  /** The event field asks for the transition into the next state, not the one into the new one. */
  readonly eventLabel = input('Event');
  /** The state the new transition leaves, if it is known: its own events are suggested first. */
  readonly from = input<string>();
  readonly picked = output<NewStep>();

  private readonly diagram = inject(DiagramStore);
  protected readonly suggestions = computed(() =>
    suggestEvents(this.diagram.diagram(), { from: this.from() }),
  );
  /** The type the popover will add: the first one until the switch says otherwise. */
  protected readonly chosen = signal<NodeType>('state');

  protected readonly isOpen = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'center', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 10 },
    { originX: 'center', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -10 },
    { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 10 },
  ];

  open(): void {
    this.isOpen.set(true);
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.chosen.set(this.types()[0] ?? 'state');
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  /** Enter in the prompt, or Escape: Escape adds the state with the defaults. */
  protected add(init?: NewStateInit): void {
    this.close();
    this.picked.emit({ type: this.chosen(), init });
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
