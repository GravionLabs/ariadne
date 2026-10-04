import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const DIAGRAM = `version: 3
name: Order Saga
direction: top-bottom
nodes:
  - id: a
    type: start
    name: Initial
  - id: b
    type: state
    name: Submitted
  - id: c
    type: end
    name: Completed
edges:
  - id: e1
    source: a
    target: b
    kind: forward
    event: OrderSubmitted
    eventSource: Shop
  - id: e2
    source: b
    target: c
    kind: forward
    event: OrderShipped
    eventSource: Shop
`;

describe('Export', () => {
  let dir: string;
  let diagram: vscode.Uri;

  beforeEach(async () => {
    await vscode.extensions.getExtension('gravionlabs.ariadne-vscode')!.activate();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-export-'));
    diagram = vscode.Uri.file(path.join(dir, 'order.saga.yaml'));
    fs.writeFileSync(diagram.fsPath, DIAGRAM);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (command: string) =>
    vscode.commands.executeCommand<string | undefined>(command, diagram);

  it('saves an SVG next to the diagram', async () => {
    const file = await run('ariadne.exportSvg');
    assert.strictEqual(file, path.join(dir, 'order.svg'));
    assert.match(fs.readFileSync(file!, 'utf8'), /^<svg [\s\S]*Submitted/);
  });

  it('saves a PNG, drawn by the extension itself', async () => {
    const file = await run('ariadne.exportPng');
    assert.strictEqual(file, path.join(dir, 'order.png'));
    const bytes = fs.readFileSync(file!);
    assert.deepStrictEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    assert.ok(bytes.length > 5000, 'with text and shapes in it');
  });

  it('saves Mermaid and the Markdown page', async () => {
    const mermaid = await run('ariadne.exportMermaid');
    assert.match(fs.readFileSync(mermaid!, 'utf8'), /stateDiagram-v2/);
    assert.strictEqual(mermaid, path.join(dir, 'order.mmd'));
    const page = await run('ariadne.exportMarkdown');
    assert.strictEqual(page, path.join(dir, 'order.md'));
    assert.match(fs.readFileSync(page!, 'utf8'), /^# Order Saga/);
  });

  it('copies Mermaid and Markdown to the clipboard, and writes no file', async () => {
    assert.strictEqual(await run('ariadne.copyMermaid'), undefined);
    assert.match(await vscode.env.clipboard.readText(), /stateDiagram-v2/);
    assert.strictEqual(await run('ariadne.copyMarkdown'), undefined);
    assert.match(await vscode.env.clipboard.readText(), /^# Order Saga/);
    assert.deepStrictEqual(fs.readdirSync(dir), ['order.saga.yaml']);
  });

  it('exports what is in the editor, saved or not', async () => {
    const document = await vscode.workspace.openTextDocument(diagram);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      diagram,
      new vscode.Range(0, 0, document.lineCount, 0),
      DIAGRAM.replace('name: Order Saga', 'name: Unsaved Name'),
    );
    await vscode.workspace.applyEdit(edit);
    const file = await run('ariadne.exportSvg');
    assert.match(fs.readFileSync(file!, 'utf8'), /Unsaved Name/);
    assert.match(fs.readFileSync(diagram.fsPath, 'utf8'), /Order Saga/);
  });

  it('writes nothing for a diagram that cannot be read', async () => {
    fs.writeFileSync(diagram.fsPath, 'nodes: [unclosed');
    assert.strictEqual(await run('ariadne.exportSvg'), undefined);
    assert.deepStrictEqual(fs.readdirSync(dir), ['order.saga.yaml']);
  });

  it('lists every export in the editor title bar menu', () => {
    const { contributes } = vscode.extensions.getExtension(
      'gravionlabs.ariadne-vscode',
    )!.packageJSON;
    const titles = contributes.commands.map((c: { title: string }) => c.title);
    for (const title of [
      'Export as Mermaid',
      'Export as SVG',
      'Export as PNG',
      'Export as Markdown',
      'Copy as Mermaid',
      'Copy as Markdown',
    ]) {
      assert.ok(titles.includes(title), title);
    }
    const bar = contributes.menus['editor/title'].map((m: { command: string }) => m.command);
    assert.ok(bar.includes('ariadne.export'));
  });
});
