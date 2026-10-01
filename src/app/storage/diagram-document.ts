import { Injectable, computed, inject, signal } from '@angular/core';
import { Diagram, emptyDiagram } from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { parseDiagram, serializeDiagram } from '../model/diagram-yaml';
import { FileRef, FileStorage } from './file-storage';

const UNTITLED = 'untitled.yaml';

/** The diagram file being edited: new/open/save through {@link FileStorage}. */
@Injectable({ providedIn: 'root' })
export class DiagramDocument {
  private readonly store = inject(DiagramStore);
  private readonly storage = inject(FileStorage);

  private readonly file = signal<FileRef | null>(null);
  /** Diagram as last loaded or saved; the store is immutable, so identity means unchanged. */
  private readonly saved = signal<Diagram>(this.store.diagram());

  readonly name = computed(() => this.file()?.name ?? UNTITLED);
  readonly dirty = computed(() => this.store.diagram() !== this.saved());
  /** Last error, e.g. an invalid file; cleared by the next successful action. */
  readonly error = signal<string | null>(null);

  newDiagram(): void {
    this.replace(emptyDiagram(), null);
  }

  /** Returns false if the user cancelled or the file was invalid. */
  async open(): Promise<boolean> {
    return this.run(async () => {
      const opened = await this.storage.open();
      if (!opened) return false;
      this.replace(parseDiagram(opened.content), opened.ref);
      return true;
    });
  }

  async save(): Promise<boolean> {
    const file = this.file();
    return file ? this.write((content) => this.storage.save(content, file)) : this.saveAs();
  }

  async saveAs(): Promise<boolean> {
    return this.write((content) => this.storage.saveAs(content, this.name()));
  }

  private write(target: (content: string) => Promise<FileRef | null>): Promise<boolean> {
    return this.run(async () => {
      const diagram = this.store.diagram();
      const ref = await target(serializeDiagram(diagram));
      if (!ref) return false;
      this.file.set(ref);
      this.saved.set(diagram);
      return true;
    });
  }

  private replace(diagram: Diagram, file: FileRef | null): void {
    this.store.load(diagram);
    this.file.set(file);
    this.saved.set(this.store.diagram());
    this.error.set(null);
  }

  private async run(action: () => Promise<boolean>): Promise<boolean> {
    try {
      const done = await action();
      if (done) this.error.set(null);
      return done;
    } catch (e) {
      this.error.set((e as Error).message);
      return false;
    }
  }
}
