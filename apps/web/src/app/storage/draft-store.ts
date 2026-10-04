import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Diagram, parseDiagram, serializeDiagram } from '@ariadne/core';
import { EditorHost } from '../host/editor-host';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from './diagram-document';

/** What is kept of the unsaved edits. */
interface DraftRecord {
  yaml: string;
  /** The file name the diagram had. */
  name: string;
  /** When it was kept, ISO 8601. */
  savedAt: string;
}

/** A draft found when the app started, read and checked. */
export interface Draft {
  diagram: Diagram;
  name: string;
  savedAt: string;
}

/** `localStorage` key of the draft. */
export const DRAFT_KEY = 'ariadne:draft';
/** How long after the last edit the draft is written. */
export const DRAFT_DELAY_MS = 1000;

/**
 * Keeps unsaved edits in `localStorage`, so a crash, a closed tab or a reload does not lose them:
 * while the document has unsaved changes a draft is written (one second after the last edit), and
 * it is removed as soon as there is nothing unsaved (saved, discarded, a new diagram, undone back
 * to the saved state). When the app starts and finds one, {@link found} holds it for the user to
 * restore or discard.
 *
 * Not used in a host (VS Code): its hot exit keeps the document. Several tabs share one draft; the
 * last one to write wins, which is fine for a safety net. Storage can be missing, full or blocked
 * (private windows): then nothing is kept and nothing is shown.
 */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  private readonly file = inject(DiagramDocument);
  private readonly store = inject(DiagramStore);
  private readonly active = !inject(EditorHost).embedded;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** The draft from the last session, until restored or discarded. */
  readonly found = signal<Draft | null>(null);

  constructor() {
    if (!this.active) return;
    this.found.set(this.read());
    effect(() => {
      const dirty = this.file.dirty();
      const diagram = this.store.diagram();
      const name = this.file.name();
      untracked(() => (dirty ? this.schedule(diagram, name) : this.clearIfSettled()));
    });
  }

  /** Opens the draft found at start as an unsaved diagram. */
  restore(): void {
    const draft = this.found();
    if (!draft) return;
    this.found.set(null);
    this.file.openDraft(draft.diagram, draft.name);
  }

  /** Throws the draft found at start away. */
  discard(): void {
    this.found.set(null);
    this.remove();
  }

  private schedule(diagram: Diagram, name: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.write(diagram, name), DRAFT_DELAY_MS);
  }

  /** Nothing is unsaved now: no draft. Not while one is waiting for the user's answer. */
  private clearIfSettled(): void {
    clearTimeout(this.timer);
    if (this.found() === null) this.remove();
  }

  private write(diagram: Diagram, name: string): void {
    const record: DraftRecord = {
      yaml: serializeDiagram(diagram),
      name,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
    } catch {
      // Full or blocked: the app works, the safety net is just not there.
    }
  }

  private remove(): void {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Blocked: nothing to remove.
    }
  }

  /** The stored draft, or `null`; one that cannot be read is removed without a word. */
  private read(): Draft | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(DRAFT_KEY);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const record = JSON.parse(raw) as Partial<DraftRecord> | null;
      if (
        typeof record?.yaml !== 'string' ||
        typeof record.name !== 'string' ||
        typeof record.savedAt !== 'string'
      ) {
        throw new Error('not a draft');
      }
      return { diagram: parseDiagram(record.yaml), name: record.name, savedAt: record.savedAt };
    } catch {
      this.remove();
      return null;
    }
  }
}
