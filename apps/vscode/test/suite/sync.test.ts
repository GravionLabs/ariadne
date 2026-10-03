import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

// The extension's exports; see `AriadneApi` in src/extension.ts.
interface OpenEditor {
  uri: vscode.Uri;
  session: { receive(data: unknown): void; idle(): PromiseLike<unknown> };
  posted: { type: string; text?: string; kind?: string }[];
}
interface Api {
  openEditors(): OpenEditor[];
}

const sample = (name: string) => `version: 3
name: ${name}
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
edges: []
`;

async function api(): Promise<Api> {
  const extension = vscode.extensions.getExtension<Api>('gravionlabs.ariadne-vscode')!;
  return extension.activate();
}

async function until<T>(what: string, probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const found = probe();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe('Document sync', () => {
  let dir: string;
  let file: vscode.Uri;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-'));
    file = vscode.Uri.file(path.join(dir, 'order.saga.yaml'));
    fs.writeFileSync(file.fsPath, sample('Order'));
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Opens the diagram in the saga editor and returns the editor that appeared. */
  async function openAndFind(column?: vscode.ViewColumn): Promise<OpenEditor> {
    const extension = await api();
    const before = new Set(extension.openEditors());
    await vscode.commands.executeCommand('vscode.openWith', file, 'ariadne.sagaEditor', column);
    return until('the editor', () => extension.openEditors().find((e) => !before.has(e)));
  }

  it('loads the real editor, which says ready and gets the document', async () => {
    const editor = await openAndFind();
    // Nothing is sent from the test: the Angular editor in the webview starts, says `ready`, and
    // the extension answers with `init`. It needs the embedded build, its policy and its files.
    const init = await until('init for the webview', () =>
      editor.posted.find((m) => m.type === 'init'),
    );
    assert.strictEqual(init.text, sample('Order'));
  });

  it('answers ready with the document', async () => {
    const editor = await openAndFind();
    editor.posted.length = 0;
    editor.session.receive({ v: 1, type: 'ready' });
    assert.strictEqual(editor.posted.find((m) => m.type === 'init')?.text, sample('Order'));
  });

  it('turns an edit of the webview into a document change: dirty, saved, not echoed', async () => {
    const editor = await openAndFind();
    editor.session.receive({ v: 1, type: 'edit', text: sample('Renamed') });
    await editor.session.idle();
    const document = await vscode.workspace.openTextDocument(file);
    assert.strictEqual(document.getText(), sample('Renamed'));
    assert.strictEqual(document.isDirty, true);
    assert.ok(!editor.posted.some((m) => m.type === 'documentChanged'), 'no echo');

    await document.save();
    assert.strictEqual(document.isDirty, false);
    assert.strictEqual(fs.readFileSync(file.fsPath, 'utf8'), sample('Renamed'));
  });

  it('tells the webview about a change made in the text editor', async () => {
    const editor = await openAndFind();
    const document = await vscode.workspace.openTextDocument(file);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), sample('Typed'));
    await vscode.workspace.applyEdit(edit);
    const changed = await until('documentChanged', () =>
      editor.posted.find((m) => m.type === 'documentChanged'),
    );
    assert.strictEqual(changed.text, sample('Typed'));
  });

  it('tells the webview about an undo in VS Code, and about a revert', async () => {
    const editor = await openAndFind();
    editor.session.receive({ v: 1, type: 'edit', text: sample('Renamed') });
    await editor.session.idle();

    // The same document in a text editor beside it: undo there is the document's undo.
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
    await vscode.commands.executeCommand('undo');
    const undone = await until('the undo', () =>
      editor.posted.find((m) => m.type === 'documentChanged' && m.text === sample('Order')),
    );
    assert.ok(undone);

    editor.posted.length = 0;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(file, new vscode.Position(0, 0), '# typed\n');
    await vscode.workspace.applyEdit(edit);
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await until('the revert', () =>
      editor.posted.find((m) => m.type === 'documentChanged' && m.text === sample('Order')),
    );
  });

  it('keeps two editors of the same file in sync', async () => {
    const first = await openAndFind(vscode.ViewColumn.One);
    const second = await openAndFind(vscode.ViewColumn.Two);
    assert.notStrictEqual(first, second);

    first.session.receive({ v: 1, type: 'edit', text: sample('FromFirst') });
    await first.session.idle();
    const seen = await until('the change in the second editor', () =>
      second.posted.find((m) => m.type === 'documentChanged'),
    );
    assert.strictEqual(seen.text, sample('FromFirst'));
    assert.ok(!first.posted.some((m) => m.type === 'documentChanged'), 'not echoed to the sender');
  });

  it('opens the file as text on request, and never changes an invalid file', async () => {
    const editor = await openAndFind();
    fs.writeFileSync(file.fsPath, 'nodes: [unclosed');
    const document = await vscode.workspace.openTextDocument(file);
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await until('the broken text', () => document.getText() === 'nodes: [unclosed');

    editor.session.receive({ v: 1, type: 'showAsText' });
    const input = await until('the text editor', () => {
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      return tab instanceof vscode.TabInputText ? tab : undefined;
    });
    assert.strictEqual(input.uri.fsPath, file.fsPath);
    assert.strictEqual(fs.readFileSync(file.fsPath, 'utf8'), 'nodes: [unclosed');
  });

  it('follows the colour theme of VS Code, live', async () => {
    const editor = await openAndFind();
    const config = vscode.workspace.getConfiguration('workbench');
    const before = config.inspect<string>('colorTheme')?.globalValue;
    try {
      await config.update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
      await until('the light theme', () =>
        editor.posted.find((m) => m.type === 'theme' && m.kind === 'light'),
      );
      await config.update('colorTheme', 'Default High Contrast', vscode.ConfigurationTarget.Global);
      await until('the high-contrast theme', () =>
        editor.posted.find((m) => m.type === 'theme' && m.kind === 'high-contrast'),
      );
    } finally {
      await config.update('colorTheme', before, vscode.ConfigurationTarget.Global);
    }
  });
});
