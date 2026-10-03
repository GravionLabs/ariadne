import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface PlannedFile {
  path: string;
  content: string;
  status: string;
}
interface Api {
  generateCsharp(
    uri: vscode.Uri,
    choose: (files: PlannedFile[], title: string) => Promise<PlannedFile[] | undefined>,
  ): Promise<string[]>;
}

const DIAGRAM = `version: 3
name: Order Saga
saga:
  class: OrderStateMachine
  namespace: Shop.Orders
  instance: OrderState
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
  - id: state-1
    type: state
    name: Submitted
  - id: end-1
    type: end
    name: Completed
edges:
  - id: edge-1
    source: start-1
    target: state-1
    kind: forward
    event: OrderSubmitted
  - id: edge-2
    source: state-1
    target: end-1
    kind: forward
    event: OrderShipped
`;

describe('Generate C#', () => {
  let dir: string;
  let diagram: vscode.Uri;
  let api: Api;

  beforeEach(async () => {
    api = (await vscode.extensions
      .getExtension<Api>('gravionlabs.ariadne-vscode')!
      .activate()) as Api;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-gen-'));
    diagram = vscode.Uri.file(path.join(dir, 'order.saga.yaml'));
    fs.writeFileSync(diagram.fsPath, DIAGRAM);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const all = async (files: PlannedFile[]) => files;

  it('is a command of the editor title bar', () => {
    const menus = vscode.extensions.getExtension('gravionlabs.ariadne-vscode')!.packageJSON
      .contributes.menus['editor/title'] as { command: string; when: string }[];
    const entry = menus.find((m) => m.command === 'ariadne.generateCsharp');
    assert.match(entry?.when ?? '', /activeCustomEditorId == ariadne\.sagaEditor/);
  });

  it('writes the new files next to the diagram, in the namespace of the saga', async () => {
    const offered: PlannedFile[][] = [];
    const written = await api.generateCsharp(diagram, async (files) => {
      offered.push(files);
      return files;
    });
    assert.deepStrictEqual(
      offered[0]!.map((f) => f.status),
      ['new', 'new', 'new'],
    );
    assert.deepStrictEqual(written.map((f) => path.basename(f)).sort(), [
      'Contracts.cs',
      'OrderState.cs',
      'OrderStateMachine.cs',
    ]);
    const machine = fs.readFileSync(path.join(dir, 'OrderStateMachine.cs'), 'utf8');
    assert.match(machine, /namespace Shop\.Orders/);
    assert.match(machine, /class OrderStateMachine\s*:\s*MassTransitStateMachine<OrderState>/);
  });

  it('writes nothing when the choice is cancelled', async () => {
    const written = await api.generateCsharp(diagram, async () => undefined);
    assert.deepStrictEqual(written, []);
    assert.deepStrictEqual(fs.readdirSync(dir), ['order.saga.yaml']);
  });

  it('writes only the files that were picked', async () => {
    const written = await api.generateCsharp(diagram, async (files) =>
      files.filter((f) => f.path.endsWith('Contracts.cs')),
    );
    assert.strictEqual(written.length, 1);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['Contracts.cs', 'order.saga.yaml']);
  });

  it('offers a file that changed as changed, and leaves unchanged ones out', async () => {
    await api.generateCsharp(diagram, all);
    fs.appendFileSync(path.join(dir, 'OrderState.cs'), '// edited by hand\n');
    const offered: PlannedFile[][] = [];
    await api.generateCsharp(diagram, async (files) => {
      offered.push(files);
      return undefined;
    });
    assert.deepStrictEqual(
      offered[0]!.map((f) => [path.basename(f.path), f.status]),
      [['OrderState.cs', 'changed']],
    );
  });

  it('uses the C# folder named by the diagram', async () => {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(
      diagram.fsPath,
      DIAGRAM.replace(
        '  instance: OrderState\n',
        '  instance: OrderState\n  source: src/Order.cs\n',
      ),
    );
    const written = await api.generateCsharp(diagram, all);
    assert.ok(written.every((f) => path.dirname(f) === path.join(dir, 'src')));
  });

  it('does not write for a diagram that cannot be read', async () => {
    fs.writeFileSync(diagram.fsPath, 'nodes: [unclosed');
    const written = await api.generateCsharp(diagram, all);
    assert.deepStrictEqual(written, []);
    assert.deepStrictEqual(fs.readdirSync(dir), ['order.saga.yaml']);
  });
});
