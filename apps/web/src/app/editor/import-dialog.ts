import { Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import type { ImportResult, ImportedSaga } from '@ariadne/masstransit';

/**
 * What was found in the C# files: which saga to open if there are several, and everything the
 * importer could not show, with the file and line. A native modal `<dialog>`, like the new-diagram
 * popup.
 */
@Component({
  selector: 'app-import-dialog',
  templateUrl: './import-dialog.html',
  styleUrl: './import-dialog.scss',
})
export class ImportDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private chosen: ImportedSaga | undefined;
  private settle: ((saga: ImportedSaga | undefined) => void) | undefined;

  protected readonly result = signal<ImportResult>({ sagas: [], warnings: [] });
  protected readonly fileCount = signal(0);
  protected readonly picked = signal(0);
  protected readonly saga = computed(() => this.result().sagas[this.picked()]);

  /** Shows the result; resolves to the saga to open, or `undefined` if the user closed it. */
  open(result: ImportResult, fileCount: number): Promise<ImportedSaga | undefined> {
    this.result.set(result);
    this.fileCount.set(fileCount);
    this.picked.set(0);
    this.chosen = undefined;
    return new Promise((resolve) => {
      this.settle = resolve;
      this.dialog().nativeElement.showModal();
    });
  }

  protected pick(index: number): void {
    this.picked.set(index);
  }

  protected summary(saga: ImportedSaga): string {
    const states = saga.diagram.nodes.filter((n) => n.type === 'state').length;
    return `${states} ${states === 1 ? 'state' : 'states'}, ${saga.diagram.edges.length} ${saga.diagram.edges.length === 1 ? 'transition' : 'transitions'}`;
  }

  protected accept(): void {
    this.chosen = this.saga();
    this.dialog().nativeElement.close();
  }

  protected cancel(): void {
    this.dialog().nativeElement.close();
  }

  /** Fires for Open, Close and Escape alike. */
  protected onClose(): void {
    this.settle?.(this.chosen);
    this.settle = undefined;
  }
}
