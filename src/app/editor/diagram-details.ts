import { Component, inject, signal } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { Icon } from './icon';

/**
 * A card on the canvas with the saga's name; expanding it shows the description. Fields commit on
 * `change` (blur or Enter), so every edit is one undo step; unchanged values are not committed.
 */
@Component({
  selector: 'app-diagram-details',
  imports: [Icon],
  templateUrl: './diagram-details.html',
  styleUrl: './diagram-details.scss',
})
export class DiagramDetails {
  protected readonly store = inject(DiagramStore);

  protected readonly expanded = signal(false);

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  protected setName(event: Event): void {
    this.store.setDetails({ name: (event.target as HTMLInputElement).value });
  }

  protected setDescription(event: Event): void {
    this.store.setDetails({ description: (event.target as HTMLTextAreaElement).value });
  }
}
