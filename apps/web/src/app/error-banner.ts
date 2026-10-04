import { Component, effect, inject, signal, untracked } from '@angular/core';
import { serializeDiagram } from '@ariadne/core';
import { Icon } from './editor/icon';
import { AppErrors } from './error-handler';
import { EditorHost } from './host/editor-host';
import { DiagramStore } from './model/diagram-store';
import { DiagramDocument } from './storage/diagram-document';
import { FileStorage, diagramFileName } from './storage/file-storage';

/**
 * Shown when something unexpected went wrong ({@link AppErrors}). The diagram is still there; the
 * banner says so and offers to copy it or save a copy, so nothing is lost even if the page has to
 * be reloaded.
 */
@Component({
  selector: 'app-error-banner',
  imports: [Icon],
  templateUrl: './error-banner.html',
  styleUrl: './error-banner.scss',
})
export class ErrorBanner {
  protected readonly errors = inject(AppErrors);
  private readonly diagram = inject(DiagramStore);
  private readonly file = inject(DiagramDocument);
  private readonly storage = inject(FileStorage);
  /** In a host (VS Code) the host owns the files: the diagram is copied, not saved from here. */
  protected readonly embedded = inject(EditorHost).embedded;

  /** What the last action did, e.g. that the clipboard was not available. */
  protected readonly feedback = signal<string | null>(null);

  constructor() {
    // A new error starts afresh.
    effect(() => {
      this.errors.current();
      untracked(() => this.feedback.set(null));
    });
  }

  protected async copyDiagram(): Promise<void> {
    try {
      await navigator.clipboard.writeText(serializeDiagram(this.diagram.diagram()));
      this.feedback.set('The diagram is on the clipboard.');
    } catch (e) {
      this.feedback.set(
        `The diagram could not be copied: ${(e as Error).message}.${this.embedded ? '' : ' Download a copy instead.'}`,
      );
    }
  }

  protected async downloadCopy(): Promise<void> {
    try {
      const saved = await this.storage.saveAs(
        serializeDiagram(this.diagram.diagram()),
        diagramFileName(this.file.name()),
      );
      if (saved) this.feedback.set(`A copy was saved as ${saved.name}.`);
    } catch (e) {
      this.feedback.set(`A copy could not be saved: ${(e as Error).message}.`);
    }
  }

  protected dismiss(): void {
    this.errors.dismiss();
    this.feedback.set(null);
  }
}
