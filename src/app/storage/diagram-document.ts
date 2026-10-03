import { Injectable, computed, inject, signal } from '@angular/core';
import { Diagram, emptyDiagram } from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { parseDiagramWithNotes, serializeDiagram } from '../model/diagram-yaml';
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
  /** What opening an older file changed, e.g. a migrated format; shown until dismissed. */
  readonly notice = signal<string | null>(null);

  newDiagram(): void {
    this.replace(emptyDiagram(), null);
  }

  /** Returns false if the user cancelled or the file was invalid. */
  async open(): Promise<boolean> {
    return this.run(async () => {
      const opened = await this.storage.open();
      if (!opened) return false;
      const { diagram, notes } = parseDiagramWithNotes(opened.content);
      // A migrated file differs from what is on disk, so it counts as unsaved until it is saved.
      this.replace(diagram, opened.ref, notes.length > 0);
      this.notice.set(notes.length > 0 ? notes.join(' ') : null);
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

  private replace(diagram: Diagram, file: FileRef | null, changed = false): void {
    this.store.load(diagram);
    this.file.set(file);
    // The store is immutable and `dirty` compares identity, so a copy marks the file as changed.
    this.saved.set(changed ? { ...this.store.diagram() } : this.store.diagram());
    this.error.set(null);
    this.notice.set(null);
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
