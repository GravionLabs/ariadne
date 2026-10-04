import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const GOOD = `version: 3
name: Order Saga
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
  - id: end-1
    type: end
    name: Completed
edges:
  - id: edge-1
    source: start-1
    target: end-1
    kind: forward
    event: OrderCompleted
    eventSource: Shop
`;

const problems = (uri: vscode.Uri) =>
  vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'Ariadne');

async function until<T>(what: string, probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const found = probe();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe('Problems of *.saga.yaml', () => {
  let dir: string;
  let file: vscode.Uri;

  beforeEach(async () => {
    await vscode.extensions.getExtension('gravionlabs.ariadne-vscode')!.activate();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-problems-'));
    file = vscode.Uri.file(path.join(dir, 'order.saga.yaml'));
    fs.writeFileSync(file.fsPath, GOOD);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports nothing for a good diagram', async () => {
    await vscode.workspace.openTextDocument(file);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepStrictEqual(problems(file), []);
  });

  it('reports what the reader rejects, on the line, without the diagram editor', async () => {
    fs.writeFileSync(file.fsPath, GOOD.replace('type: end', 'type: finish'));
    await vscode.workspace.openTextDocument(file);
    const found = await until('the problem', () => {
      const d = problems(file);
      return d.length > 0 && d;
    });
    assert.strictEqual(found[0]!.severity, vscode.DiagnosticSeverity.Error);
    assert.match(found[0]!.message, /nodes\[1\]\.type must be one of/);
    assert.strictEqual(found[0]!.range.start.line, 8);
    assert.strictEqual(vscode.window.tabGroups.all.flatMap((g) => g.tabs).length, 0);
  });

  it('reports findings of the validation with their rule', async () => {
    fs.writeFileSync(file.fsPath, GOOD.replace('type: start', 'type: state'));
    await vscode.workspace.openTextDocument(file);
    const found = await until('the finding', () =>
      problems(file).find((d) => d.code === 'no-initial-state'),
    );
    assert.strictEqual(found.severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(found.range.start.line, 3);
  });

  it('updates while typing, after a short pause, and clears when fixed', async () => {
    const document = await vscode.workspace.openTextDocument(file);
    const replace = async (text: string) => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), text);
      await vscode.workspace.applyEdit(edit);
    };
    await replace(GOOD.replace('target: end-1', 'target: nowhere'));
    const found = await until('the problem', () => {
      const d = problems(file);
      return d.length > 0 && d;
    });
    assert.match(found[0]!.message, /is not a node/);
    // Not saved: this came from the text in the editor.
    assert.strictEqual(document.isDirty, true);

    await replace(GOOD);
    await until('the problem to go', () => problems(file).length === 0);
  });
});
