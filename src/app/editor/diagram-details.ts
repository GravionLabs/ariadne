import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, inject, signal } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { Icon } from './icon';

/**
 * The top bar's "Details" button: the saga's name and description. Fields commit on `change` (blur
 * or Enter), so every edit is one undo step; unchanged values are not committed.
 */
@Component({
  selector: 'app-diagram-details',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon],
  templateUrl: './diagram-details.html',
  styleUrl: './diagram-details.scss',
})
export class DiagramDetails {
  protected readonly store = inject(DiagramStore);

  protected readonly isOpen = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected setName(event: Event): void {
    this.store.setDetails({ name: (event.target as HTMLInputElement).value });
  }

  protected setDescription(event: Event): void {
    this.store.setDetails({ description: (event.target as HTMLTextAreaElement).value });
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
