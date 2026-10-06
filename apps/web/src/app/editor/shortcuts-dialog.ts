import { Component, ElementRef, viewChild } from '@angular/core';
import { SHORTCUT_GROUPS, keyParts } from './shortcuts';

/**
 * The keyboard shortcuts, in a native modal `<dialog>` (focus trap, Escape and backdrop come with
 * it). Opened by the "?" button and by the `?` key.
 */
@Component({
  selector: 'app-shortcuts-dialog',
  templateUrl: './shortcuts-dialog.html',
  styleUrl: './shortcuts-dialog.scss',
})
export class ShortcutsDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly groups = SHORTCUT_GROUPS;
  protected readonly keyParts = keyParts;

  open(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
