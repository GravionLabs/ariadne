import * as vscode from 'vscode';

export const VIRTUAL_SCHEME = 'ariadne-virtual';

/** Text that exists only to be compared in a diff: the imported diagram, the generated C#. */
export class VirtualDocuments implements vscode.TextDocumentContentProvider {
  private readonly texts = new Map<string, string>();
  private counter = 0;
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  /** A URI that shows `text`; `name` is what the diff tab calls it. */
  add(name: string, text: string): vscode.Uri {
    const uri = vscode.Uri.from({
      scheme: VIRTUAL_SCHEME,
      path: `/${name}`,
      query: String(++this.counter),
    });
    this.texts.set(uri.toString(), text);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.texts.get(uri.toString()) ?? '';
  }
}
