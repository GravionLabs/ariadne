import * as vscode from 'vscode';
import { createNonce, placeholderHtml } from './webview-html';

export const SAGA_EDITOR_VIEW_TYPE = 'ariadne.sagaEditor';

/** The custom editor of `*.saga.yaml`: the document stays a text document, the webview shows it. */
export class SagaEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): void {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };
    webview.html = placeholderHtml({
      cspSource: webview.cspSource,
      nonce: createNonce(),
      title: document.uri.path.split('/').pop() ?? 'Saga diagram',
    });
  }
}
