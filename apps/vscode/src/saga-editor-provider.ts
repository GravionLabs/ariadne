import * as vscode from 'vscode';
import type { CodeTarget, HostMessage } from '@ariadne/editor-protocol';
import { EditorSession } from './editor-session';
import { themeKindOf } from './theme-kind';
import { createNonce, embeddedHtml, placeholderHtml } from './webview-html';

export const SAGA_EDITOR_VIEW_TYPE = 'ariadne.sagaEditor';

/** An open diagram, with what was sent to its webview; for the integration tests. */
export interface OpenEditor {
  readonly uri: vscode.Uri;
  readonly session: EditorSession;
  readonly posted: HostMessage[];
}

/** The custom editor of `*.saga.yaml`: the document stays a text document, the webview shows it. */
export class SagaEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly webviewRoot: vscode.Uri;
  /** The editors that are open now. */
  readonly open = new Set<OpenEditor>();

  constructor(
    extensionUri: vscode.Uri,
    private readonly goToCode: (diagram: vscode.Uri, target: CodeTarget) => Promise<void>,
  ) {
    this.webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [this.webviewRoot] };
    const posted: HostMessage[] = [];
    const session: EditorSession = new EditorSession(
      {
        getText: () => document.getText(),
        replaceText: (text) => {
          const edit = new vscode.WorkspaceEdit();
          const whole = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          );
          edit.replace(document.uri, whole, text);
          return vscode.workspace.applyEdit(edit);
        },
      },
      {
        post: (message) => {
          posted.push(message);
          if (posted.length > 50) posted.shift();
          void webview.postMessage(message);
        },
        theme: () => themeKindOf(vscode.window.activeColorTheme.kind),
        settings: () => ({
          autoLayout: vscode.workspace.getConfiguration('ariadne.editor').get('autoLayout', true),
        }),
        showAsText: () =>
          void vscode.commands.executeCommand('vscode.openWith', document.uri, 'default'),
        goToCode: (target) => void this.goToCode(document.uri, target),
        showError: (message) => void vscode.window.showErrorMessage(message),
      },
    );

    const subscriptions = [
      webview.onDidReceiveMessage((data) => session.receive(data)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === document && e.contentChanges.length > 0) session.documentChanged();
      }),
      vscode.window.onDidChangeActiveColorTheme(() => session.themeChanged()),
    ];
    const editor: OpenEditor = { uri: document.uri, session, posted };
    this.open.add(editor);
    webviewPanel.onDidDispose(() => {
      subscriptions.forEach((s) => s.dispose());
      this.open.delete(editor);
    });

    // The listener is set before the page loads, so its `ready` is not missed.
    webview.html = await this.html(webview, document);
  }

  private async html(webview: vscode.Webview, document: vscode.TextDocument): Promise<string> {
    const options = {
      cspSource: webview.cspSource,
      nonce: createNonce(),
      title: document.uri.path.split('/').pop() ?? 'Saga diagram',
    };
    try {
      const index = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(this.webviewRoot, 'index.html'),
      );
      return embeddedHtml(Buffer.from(index).toString('utf8'), {
        ...options,
        baseUri: webview.asWebviewUri(this.webviewRoot).toString(),
      });
    } catch {
      return placeholderHtml(options);
    }
  }
}
