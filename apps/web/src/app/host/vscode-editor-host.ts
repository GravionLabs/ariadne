import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import { parseHostMessage, type EditorMessage, type HostMessage } from '@ariadne/editor-protocol';
import { EditorHost } from './editor-host';

/** The part of VS Code's webview API used here. */
export interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** The editor in a VS Code webview: messages go through `acquireVsCodeApi()` and `postMessage`. */
export class VsCodeEditorHost extends EditorHost {
  readonly embedded = true;

  private readonly view = inject(DOCUMENT).defaultView!;
  // `acquireVsCodeApi` may be called only once per webview.
  private readonly api: VsCodeApi = acquireVsCodeApi();

  post(message: EditorMessage): void {
    this.api.postMessage(message);
  }

  listen(handler: (message: HostMessage) => void): () => void {
    const onMessage = (event: MessageEvent): void => {
      const message = parseHostMessage(event.data);
      if (message) handler(message);
    };
    this.view.addEventListener('message', onMessage);
    return () => this.view.removeEventListener('message', onMessage);
  }
}
