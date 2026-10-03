import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import type { GenerateResult } from '@ariadne/masstransit/generate';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';

/** A line of generated code, with its `// TODO` part marked so it stands out. */
interface CodeLine {
  code: string;
  todo?: string;
}

/**
 * The C# generated from the diagram: one file at a time to read and copy, all of them to save, and
 * what could not be generated. A native modal `<dialog>`, like the import dialog.
 */
@Component({
  selector: 'app-generate-dialog',
  templateUrl: './generate-dialog.html',
  styleUrl: './generate-dialog.scss',
})
export class GenerateDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly storage = inject(FileStorage);
  private readonly document = inject(DiagramDocument);
  private readonly window = inject(DOCUMENT).defaultView;

  protected readonly result = signal<GenerateResult>({ files: [], warnings: [] });
  protected readonly folder = signal('saga');
  protected readonly current = signal(0);
  protected readonly status = signal('');
  protected readonly file = computed(() => this.result().files[this.current()]);
  protected readonly lines = computed<CodeLine[]>(() =>
    (this.file()?.content ?? '').split('\n').map((line) => {
      const at = line.search(/\/\/ TODO|\/\* TODO/);
      return at < 0 ? { code: line } : { code: line.slice(0, at), todo: line.slice(at) };
    }),
  );

  /** `folder` names the zip when the browser cannot write into a directory. */
  open(result: GenerateResult, folder: string): void {
    this.result.set(result);
    this.folder.set(folder);
    this.current.set(0);
    this.status.set('');
    this.dialog().nativeElement.showModal();
  }

  protected show(index: number): void {
    this.current.set(index);
    this.status.set('');
  }

  protected async copy(): Promise<void> {
    try {
      const clipboard = this.window?.navigator.clipboard;
      if (!clipboard) throw new Error('The clipboard is not available in this browser.');
      await clipboard.writeText(this.file().content);
      this.status.set(`${this.file().path} copied.`);
    } catch (e) {
      this.status.set((e as Error).message);
    }
  }

  protected async save(): Promise<void> {
    try {
      const files = this.result().files.map((f) => ({ name: f.path, content: f.content }));
      if (await this.storage.saveFiles(files, this.folder())) {
        this.status.set(`Saved ${files.length} ${files.length === 1 ? 'file' : 'files'}.`);
      }
    } catch (e) {
      this.document.setError((e as Error).message);
    }
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
