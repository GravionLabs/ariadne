import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** What the "New diagram" popup asks for. */
export interface NewDiagramDetails {
  name: string;
  description?: string;
}

/** Asks for the name (required) and description (optional) of a new saga; `undefined` if cancelled. */
export async function askNewDiagram(dialog: Dialog): Promise<NewDiagramDetails | undefined> {
  const ref = dialog.open<NewDiagramDetails | undefined>(NewDiagramDialog, {
    ariaModal: true,
    ariaLabelledBy: 'new-diagram-title',
    panelClass: 'new-diagram-panel',
  });
  return firstValueFrom(ref.closed);
}

@Component({
  selector: 'app-new-diagram-dialog',
  templateUrl: './new-diagram-dialog.html',
  styleUrl: './new-diagram-dialog.scss',
})
export class NewDiagramDialog {
  private readonly ref = inject<DialogRef<NewDiagramDetails | undefined>>(DialogRef);

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly valid = computed(() => this.name().trim() !== '');

  protected create(event: Event): void {
    event.preventDefault();
    if (!this.valid()) return;
    const description = this.description().trim();
    this.ref.close({
      name: this.name().trim(),
      ...(description ? { description } : {}),
    });
  }

  protected cancel(): void {
    this.ref.close(undefined);
  }
}
