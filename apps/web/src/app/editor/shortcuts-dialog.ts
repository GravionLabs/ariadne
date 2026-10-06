import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
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
export class ShortcutsDialog implements AfterViewInit {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly groups = SHORTCUT_GROUPS;
  protected readonly keyParts = keyParts;

  open(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  ngAfterViewInit(): void {
    // A click outside the content lands on the dialog itself (its backdrop): that closes it. Mouse
    // only, as Escape and the close button are the keyboard's way, so it is not a template handler.
    const dialog = this.dialog().nativeElement;
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close();
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
