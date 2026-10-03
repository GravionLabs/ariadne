import { Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { SAMPLES, Sample } from '../samples';

/** What the "New diagram" popup asks for. */
export interface NewDiagramDetails {
  name: string;
  description?: string;
  /** Set when a sample was picked instead of a name: open that saga. */
  sample?: Sample;
}

/**
 * The "New diagram" popup, a native modal `<dialog>` (focus trap, Escape and backdrop come with it).
 * Asks for the name (required) and description (optional) of a new saga, or offers a sample.
 */
@Component({
  selector: 'app-new-diagram-dialog',
  templateUrl: './new-diagram-dialog.html',
  styleUrl: './new-diagram-dialog.scss',
})
export class NewDiagramDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private result: NewDiagramDetails | undefined;
  private settle: ((result: NewDiagramDetails | undefined) => void) | undefined;

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly samples = SAMPLES;
  protected readonly valid = computed(() => this.name().trim() !== '');

  /** Shows the popup; resolves to the details, or `undefined` if it was cancelled. */
  open(): Promise<NewDiagramDetails | undefined> {
    this.name.set('');
    this.description.set('');
    this.result = undefined;
    return new Promise((resolve) => {
      this.settle = resolve;
      this.dialog().nativeElement.showModal();
    });
  }

  protected create(event: Event): void {
    event.preventDefault();
    if (!this.valid()) return;
    const description = this.description().trim();
    this.result = { name: this.name().trim(), ...(description ? { description } : {}) };
    this.dialog().nativeElement.close();
  }

  protected pickSample(sample: Sample): void {
    this.result = { name: sample.title, sample };
    this.dialog().nativeElement.close();
  }

  protected cancel(): void {
    this.dialog().nativeElement.close();
  }

  /** Fires for Create, Cancel and Escape alike. */
  protected onClose(): void {
    this.settle?.(this.result);
    this.settle = undefined;
  }
}
