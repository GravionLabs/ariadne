import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, input, output, signal } from '@angular/core';
import { FFlowModule } from '@foblex/flow';
import { Icon } from './icon';
import { NODE_TYPES } from './node-types';
import { NodeType } from '@ariadne/core';

/**
 * Round "+" that opens a picker of node types (or adds the only one directly); used after states
 * and on transitions.
 */
@Component({
  selector: 'app-add-step-button',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, FFlowModule, Icon],
  host: { '[class.open]': 'isOpen()' },
  templateUrl: './add-step-button.html',
  styleUrl: './add-step-button.scss',
})
export class AddStepButton {
  readonly types = input.required<readonly NodeType[]>();
  readonly label = input('Add a node');
  readonly picked = output<NodeType>();

  protected readonly info = NODE_TYPES;
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
    // With a single choice there is nothing to pick from.
    const [only, ...rest] = this.types();
    if (only && rest.length === 0) {
      this.picked.emit(only);
      return;
    }
    this.isOpen.update((open) => !open);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected pick(type: NodeType): void {
    this.close();
    this.picked.emit(type);
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
