import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Diagram, parseDiagramWithNotes, serializeDiagram } from '@ariadne/core';
import type { CodeTarget, HostMessage } from '@ariadne/editor-protocol';
import { DiagramStore } from '../model/diagram-store';
import { Theme } from '../theme';
import { EditorHost } from './editor-host';

/**
 * Keeps the diagram and the host's document the same (docs/specs/vscode-protocol.md). The document
 * text is the source of truth: `init` and `documentChanged` replace the diagram, and every change
 * the user makes goes back as `edit` with the whole deterministic text. Nothing happens in a
 * standalone editor.
 */
@Injectable({ providedIn: 'root' })
export class EmbeddedSync {
  private readonly host = inject(EditorHost);
  private readonly store = inject(DiagramStore);
  private readonly theme = inject(Theme);
  private readonly document = inject(DOCUMENT);

  /** Why the document cannot be shown, while it cannot; the diagram is not editable then. */
  readonly invalid = signal<string | null>(null);
  /** Counts the documents shown from the start (`init`), so the view can fit the new diagram. */
  readonly opened = signal(0);

  /** "Go to code" can be offered: inside a host, and the diagram names its C# file. */
  readonly canGoToCode = computed(() => this.host.embedded && !!this.store.diagram().saga?.source);

  /** The diagram as the host last gave it; a different one is a change of the user. */
  private loaded: Diagram | null = null;
  private lastSent: string | null = null;
  private started = false;

  constructor() {
    effect(() => {
      const diagram = this.store.diagram();
      untracked(() => this.send(diagram));
    });
  }

  /** Starts the conversation with the host; once, and only when there is a host. */
  start(): void {
    if (this.started || !this.host.embedded) return;
    this.started = true;
    // The styles take the colours, font and focus ring of VS Code (src/styles.scss).
    this.document.documentElement.setAttribute('data-host', 'vscode');
    this.host.listen((message) => this.receive(message));
    this.host.post({ v: 1, type: 'ready' });
  }

  /** "Open as text" in the error state. */
  showAsText(): void {
    this.host.post({ v: 1, type: 'showAsText' });
  }

  /** Asks the host to open the C# of the diagram at a state or transition. */
  goToCode(target: CodeTarget): void {
    this.host.post({ v: 1, type: 'goToCode', target });
  }

  private receive(message: HostMessage): void {
    switch (message.type) {
      case 'init':
        this.theme.setHost(message.theme);
        // A new start: whatever was sent before belongs to another document.
        this.lastSent = null;
        if (this.apply(message.text)) this.opened.update((n) => n + 1);
        break;
      case 'documentChanged':
        // The host never echoes our own edit; this guards against the same text arriving anyway.
        if (message.text !== this.lastSent) this.apply(message.text);
        break;
      case 'theme':
        this.theme.setHost(message.kind);
        break;
      case 'requestExport':
        // Answered with the export commands.
        break;
    }
  }

  /** Shows `text`; an invalid text leaves the diagram alone and is reported instead. */
  private apply(text: string): boolean {
    try {
      const { diagram } = parseDiagramWithNotes(text);
      this.invalid.set(null);
      this.store.load(diagram);
      // The text already holds this diagram: sending it back would only rewrite the file.
      this.loaded = diagram;
      return true;
    } catch (e) {
      this.invalid.set((e as Error).message);
      return false;
    }
  }

  private send(diagram: Diagram): void {
    // Nothing to send before the host gave us a document, while it cannot be read, or for what
    // the host just gave us.
    if (!this.started || !this.loaded || this.invalid() || diagram === this.loaded) return;
    const text = serializeDiagram(diagram);
    this.lastSent = text;
    this.host.post({ v: 1, type: 'edit', text });
  }
}
