import { Injectable } from '@angular/core';
import type { EditorMessage, HostMessage } from '@ariadne/editor-protocol';

/**
 * What the editor needs from whatever embeds it. The web app runs on its own
 * ({@link BrowserEditorHost}, the default); in the VS Code extension the document comes from the
 * host and every change goes back to it (`VsCodeEditorHost`, docs/specs/vscode-protocol.md).
 */
@Injectable({ providedIn: 'root', useFactory: () => new BrowserEditorHost() })
export abstract class EditorHost {
  /**
   * Whether a host owns the document: the file actions and the editor's own undo history are off
   * (the host saves, and undoes on the document), everything else is the same.
   */
  abstract readonly embedded: boolean;

  /** Tells the host something; the standalone editor has no one to tell. */
  abstract post(message: EditorMessage): void;

  /** Calls `handler` for every message from the host; returns how to stop. */
  abstract listen(handler: (message: HostMessage) => void): () => void;
}

/** The editor on its own, in a browser tab: nothing embeds it. */
export class BrowserEditorHost extends EditorHost {
  readonly embedded = false;

  post(): void {
    // No host to tell.
  }

  listen(): () => void {
    return () => {};
  }
}
