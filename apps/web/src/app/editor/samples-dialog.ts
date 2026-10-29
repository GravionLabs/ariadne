import { Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { SAMPLE_GROUPS, Sample, TOUR_SAMPLES, loadLibrarySamples } from '../samples';

/**
 * The "Samples" popup, a native modal `<dialog>` (focus trap, Escape and backdrop come with it):
 * the tour and the library of real-world sagas, to open one of them.
 */
@Component({
  selector: 'app-samples-dialog',
  templateUrl: './samples-dialog.html',
  styleUrl: './samples-dialog.scss',
})
export class SamplesDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private result: Sample | undefined;
  private settle: ((result: Sample | undefined) => void) | undefined;

  /** The library, once it has been loaded (the tour is there from the start). */
  private readonly library = signal<readonly Sample[]>([]);
  /** The samples by group, in the order shown; a group without samples is left out. */
  protected readonly groups = computed(() => {
    const all = [...TOUR_SAMPLES, ...this.library()];
    return SAMPLE_GROUPS.map((g) => ({
      ...g,
      samples: all.filter((s) => s.group === g.id),
    })).filter((g) => g.samples.length > 0);
  });

  /** Shows the popup; resolves to the sample picked, or `undefined` if it was cancelled. */
  open(): Promise<Sample | undefined> {
    this.result = undefined;
    // The library is a chunk of its own: the tour shows at once, the library when it has arrived.
    void loadLibrarySamples().then((samples) => this.library.set(samples));
    return new Promise((resolve) => {
      this.settle = resolve;
      this.dialog().nativeElement.showModal();
    });
  }

  protected pick(sample: Sample): void {
    this.result = sample;
    this.dialog().nativeElement.close();
  }

  protected cancel(): void {
    this.dialog().nativeElement.close();
  }

  /** Fires for a pick, Cancel and Escape alike. */
  protected onClose(): void {
    this.settle?.(this.result);
    this.settle = undefined;
  }
}
