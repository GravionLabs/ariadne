import {
  parseEditorMessage,
  type EditorSettings,
  type CodeTarget,
  type HostMessage,
  type ThemeKind,
} from '@ariadne/editor-protocol';

/** The text document behind one editor, as far as a session needs it. */
export interface SessionDocument {
  getText(): string;
  /** Replaces the whole text (one `WorkspaceEdit`); resolves to whether VS Code applied it. */
  replaceText(text: string): PromiseLike<boolean>;
}

/** The webview and the window around it, as far as a session needs them. */
export interface SessionView {
  post(message: HostMessage): void;
  theme(): ThemeKind;
  settings(): EditorSettings;
  /** Opens the document in the text editor. */
  showAsText(): void;
  /** Opens the C# of the diagram at a state or transition. */
  goToCode(target: CodeTarget): void;
  showError(message: string): void;
  /**
   * Tells the user a change of the webview could not be written into the document, and offers a way
   * out (open the text, or revert the webview to the document). Resolves once they answered or
   * dismissed it.
   */
  editFailed(message: string): PromiseLike<unknown>;
}

/**
 * One open diagram: the conversation between a text document and the editor in its webview (see
 * docs/specs/vscode-protocol.md). The document is the source of truth. The webview's edits become
 * whole-document replacements, one at a time and in order; changes the document gets from anywhere
 * else are sent to the webview. The webview's own edits are not echoed back to it.
 */
export class EditorSession {
  private queue: PromiseLike<unknown> = Promise.resolve();
  /** Texts the webview wrote that VS Code has not reported as a change yet. */
  private readonly own: string[] = [];
  /** An `editFailed` message is on screen: further failures wait for it instead of piling up. */
  private failureShown = false;

  constructor(
    private readonly document: SessionDocument,
    private readonly view: SessionView,
  ) {}

  /** A message from the webview; anything that is not part of the protocol is ignored. */
  receive(data: unknown): void {
    const message = parseEditorMessage(data);
    if (!message) return;
    switch (message.type) {
      case 'ready':
        this.view.post({
          v: 1,
          type: 'init',
          text: this.document.getText(),
          theme: this.view.theme(),
          settings: this.view.settings(),
        });
        break;
      case 'edit':
        this.write(message.text);
        break;
      case 'showAsText':
        this.view.showAsText();
        break;
      case 'goToCode':
        this.view.goToCode(message.target);
        break;
      case 'error':
        this.view.showError(message.message);
        break;
    }
  }

  /** The document's text changed (not only its dirty state). */
  documentChanged(): void {
    const text = this.document.getText();
    const mine = this.own.indexOf(text);
    if (mine >= 0) {
      this.own.splice(mine, 1);
      return;
    }
    this.view.post({ v: 1, type: 'documentChanged', text });
  }

  themeChanged(): void {
    this.view.post({ v: 1, type: 'theme', kind: this.view.theme() });
  }

  /** Puts the webview back to what the document says, dropping changes that could not be saved. */
  revert(): void {
    this.view.post({ v: 1, type: 'documentChanged', text: this.document.getText() });
  }

  /** Resolves when the edits received so far are applied. */
  idle(): PromiseLike<unknown> {
    return this.queue;
  }

  private write(text: string): void {
    this.queue = this.queue.then(async () => {
      if (this.document.getText() === text) return;
      this.own.push(text);
      let applied = false;
      let reason = 'VS Code did not apply it (the file may be read-only).';
      try {
        applied = await this.document.replaceText(text);
      } catch (e) {
        reason = (e as Error).message;
      }
      if (!applied) this.failed(`The change could not be saved: ${reason}`);
      if (!applied) this.own.splice(this.own.lastIndexOf(text), 1);
    });
  }

  private failed(message: string): void {
    if (this.failureShown) return;
    this.failureShown = true;
    void Promise.resolve(this.view.editFailed(message)).then(
      () => (this.failureShown = false),
      () => (this.failureShown = false),
    );
  }
}
