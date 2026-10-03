import * as vscode from 'vscode';
import { createNonce, embeddedHtml, placeholderHtml } from './webview-html';

export const SAGA_EDITOR_VIEW_TYPE = 'ariadne.sagaEditor';

/** The custom editor of `*.saga.yaml`: the document stays a text document, the webview shows it. */
export class SagaEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly webviewRoot: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [this.webviewRoot] };
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
