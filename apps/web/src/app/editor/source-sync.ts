import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { locateSourceError } from './source-errors';
import { DiagramDocument } from '../storage/diagram-document';
import {
  Diagram,
  DiagramFormatError,
  parseDiagramWithNotes,
  serializeDiagram,
} from '@ariadne/core';

/** Pause after the last keystroke before the text is parsed and applied. */
export const SOURCE_DEBOUNCE_MS = 300;

/** What is wrong with the text: shown under the editor and marked in it. */
export interface SourceError {
  message: string;
  /** Where the problem is (1-based), when it can be placed. */
  line?: number;
  column?: number;
}

export type SourceStatus =
  /** The diagram is what the text says. */
  | { kind: 'synced' }
  /** The text changed and has not been applied yet. */
  | { kind: 'pending' }
  /** The text is not a valid diagram; the diagram keeps its last valid state. */
  | { kind: 'error'; error: SourceError };

/**
 * Keeps the source text and the diagram in step.
 *
 * - Diagram → text: whenever the diagram changes (canvas, inspector, undo/redo, opening a file)
 *   the text becomes the file format of the new diagram.
 * - Text → diagram: edits are parsed after a short pause. A valid text is applied as one undo
 *   step; an invalid one is reported and changes nothing, neither the diagram nor the text.
 *
 * A diagram that came from the text is remembered, so the text the user is typing is not
 * rewritten (reformatted) while they type.
 */
@Injectable()
export class SourceSync {
  private readonly store = inject(DiagramStore);
  private readonly document = inject(DiagramDocument);

  private readonly _text = signal(serializeDiagram(this.store.diagram()));
  private readonly _status = signal<SourceStatus>({ kind: 'synced' });
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The diagram this service put into the store from the text, until the store reports it. */
  private applied: Diagram | null = null;

  readonly text = this._text.asReadonly();
  readonly status = this._status.asReadonly();

  constructor() {
    effect(() => {
      const diagram = this.store.diagram();
      untracked(() => this.diagramChanged(diagram));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** The user edited the text in the panel. */
  edit(text: string): void {
    if (text === this._text()) return;
    this._text.set(text);
    this._status.set({ kind: 'pending' });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.apply(), SOURCE_DEBOUNCE_MS);
  }

  /** Parses the text now instead of waiting for the pause, e.g. when the panel loses focus. */
  flush(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.apply();
  }

  private apply(): void {
    this.timer = undefined;
    try {
      const { diagram, notes } = parseDiagramWithNotes(this._text());
      if (this.store.replace(diagram)) this.applied = this.store.diagram();
      if (notes.length > 0) this.document.setNotice(notes.join(' '));
      this._status.set({ kind: 'synced' });
    } catch (e) {
      if (!(e instanceof DiagramFormatError)) throw e;
      const at = locateSourceError(this._text(), e.message);
      this._status.set({
        kind: 'error',
        error: { message: e.message, line: at?.line, column: at?.column },
      });
    }
  }

  private diagramChanged(diagram: Diagram): void {
    if (diagram === this.applied) {
      // Our own edit coming back. Forget it, so undoing to this very diagram later is not
      // mistaken for it.
      this.applied = null;
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    this.applied = null;
    this._text.set(serializeDiagram(diagram));
    this._status.set({ kind: 'synced' });
  }
}
