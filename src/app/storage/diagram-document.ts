import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Diagram, emptyDiagram } from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { parseDiagramWithNotes, serializeDiagram } from '../model/diagram-yaml';
import { FileRef, FileStorage, UNTITLED_NAME, diagramFileName } from './file-storage';

interface DocumentState {
  file: FileRef | null;
  /** Diagram as last loaded or saved; the store is immutable, so identity means unchanged. */
  saved: Diagram;
  /** Last error, e.g. an invalid file; cleared by the next successful action. */
  error: string | null;
  /** What opening an older file changed, e.g. a migrated format; shown until dismissed. */
  notice: string | null;
}

/** The diagram file being edited: new/open/save through {@link FileStorage}. */
export const DiagramDocument = signalStore(
  { providedIn: 'root' },
  withState<DocumentState>(() => ({
    file: null,
    saved: inject(DiagramStore).diagram(),
    error: null,
    notice: null,
  })),
  withComputed(({ file, saved }) => {
    const diagram = inject(DiagramStore);
    return {
      name: computed(() => file()?.name ?? UNTITLED_NAME),
      dirty: computed(() => diagram.diagram() !== saved()),
    };
  }),
  withMethods((store, diagram = inject(DiagramStore), storage = inject(FileStorage)) => {
    const replace = (next: Diagram, file: FileRef | null, changed = false): void => {
      diagram.load(next);
      patchState(store, {
        file,
        // The store is immutable and `dirty` compares identity, so a copy marks the file as changed.
        saved: changed ? { ...diagram.diagram() } : diagram.diagram(),
        error: null,
        notice: null,
      });
    };

    const run = async (action: () => Promise<boolean>): Promise<boolean> => {
      try {
        const done = await action();
        if (done) patchState(store, { error: null });
        return done;
      } catch (e) {
        patchState(store, { error: (e as Error).message });
        return false;
      }
    };

    const write = (target: (content: string) => Promise<FileRef | null>): Promise<boolean> =>
      run(async () => {
        const current = diagram.diagram();
        const ref = await target(serializeDiagram(current));
        if (!ref) return false;
        patchState(store, { file: ref, saved: current });
        return true;
      });

    const saveAs = (): Promise<boolean> =>
      // Always suggest a `*.saga.yaml` name, also for a legacy `.yaml` file opened before.
      write((content) => storage.saveAs(content, diagramFileName(store.name())));

    return {
      setError(error: string | null): void {
        patchState(store, { error });
      },

      setNotice(notice: string | null): void {
        patchState(store, { notice });
      },

      newDiagram(): void {
        replace(emptyDiagram(), null);
      },

      /** Returns false if the user cancelled or the file was invalid. */
      open(): Promise<boolean> {
        return run(async () => {
          const opened = await storage.open();
          if (!opened) return false;
          const { diagram: parsed, notes } = parseDiagramWithNotes(opened.content);
          // A migrated file differs from what is on disk, so it counts as unsaved until it is saved.
          replace(parsed, opened.ref, notes.length > 0);
          patchState(store, { notice: notes.length > 0 ? notes.join(' ') : null });
          return true;
        });
      },

      save(): Promise<boolean> {
        const file = store.file();
        return file ? write((content) => storage.save(content, file)) : saveAs();
      },

      saveAs,
    };
  }),
);

export type DiagramDocument = InstanceType<typeof DiagramDocument>;
