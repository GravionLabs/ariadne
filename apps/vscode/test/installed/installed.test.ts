import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

// These run against the extension as installed from the .vsix into a clean VS Code, not against the
// source: they notice what the package leaves out (a WebAssembly file, the font, the webview).

interface OpenEditor {
  uri: vscode.Uri;
  posted: { type: string }[];
}
interface Api {
  openEditors(): OpenEditor[];
}

const EXPECTED_VERSION = process.env['ARIADNE_VSIX_VERSION'];
const INSTALL_ROOT = process.env['ARIADNE_INSTALL_ROOT'];

const SOURCE = `using MassTransit;

namespace Shop;

public class OrderState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; }
}

public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
    public OrderStateMachine()
    {
        InstanceState(x => x.CurrentState);
        Initially(When(OrderSubmitted).TransitionTo(Submitted));
        During(Submitted, When(OrderShipped).Finalize());
    }

    public State Submitted { get; private set; }
    public Event<OrderSubmitted> OrderSubmitted { get; private set; }
    public Event<OrderShipped> OrderShipped { get; private set; }
}

public record OrderSubmitted(Guid CorrelationId);
public record OrderShipped(Guid CorrelationId);
`;

async function until<T>(what: string, probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 400; i++) {
    const found = probe();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe('The installed extension', () => {
  const extension = vscode.extensions.getExtension<Api>('gravionlabs.ariadne-vscode');
  let dir: string;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-installed-'));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('is the one from the .vsix, with the version of the release', () => {
    assert.ok(extension, 'the extension is installed');
    assert.ok(INSTALL_ROOT, 'the test is started by scripts/test-vsix.mjs');
    assert.ok(
      extension.extensionPath.startsWith(INSTALL_ROOT),
      `${extension.extensionPath} is inside ${INSTALL_ROOT}`,
    );
    assert.strictEqual(extension.packageJSON.version, EXPECTED_VERSION);
  });

  it('carries what it needs at run time', () => {
    for (const file of [
      'dist/extension.js',
      'dist/webview/index.html',
      'dist/webview/main.js',
      'dist/tree-sitter-c_sharp.wasm',
      'dist/web-tree-sitter.wasm',
      'dist/resvg.wasm',
      'dist/DejaVuSansCondensed.ttf',
      'dist/DejaVuSansCondensed-Bold.ttf',
      'dist/saga.schema.json',
      'icon.png',
    ]) {
      assert.ok(
        fs.existsSync(path.join(extension!.extensionPath, file)),
        `${file} is in the package`,
      );
    }
  });

  it('activates and registers its commands', async () => {
    await extension!.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'ariadne.newDiagram',
      'ariadne.importFromCsharp',
      'ariadne.generateCsharp',
      'ariadne.exportPng',
    ]) {
      assert.ok(commands.includes(id), `${id} is registered`);
    }
  });

  it('opens a diagram in the editor, whose webview loads from the package', async () => {
    const file = vscode.Uri.file(path.join(dir, 'order.saga.yaml'));
    fs.writeFileSync(
      file.fsPath,
      'version: 3\nname: Order Saga\nnodes:\n  - id: a\n    type: start\n    name: Initial\nedges: []\n',
    );
    const api = await extension!.activate();
    await vscode.commands.executeCommand('vscode.openWith', file, 'ariadne.sagaEditor');
    const editor = await until('the editor', () =>
      api.openEditors().find((e) => e.uri.fsPath === file.fsPath),
    );
    // The Angular editor starts in the webview, says `ready`, and gets the document.
    await until('init for the webview', () => editor.posted.find((m) => m.type === 'init'));
  });

  it('imports C# with the parser it ships', async () => {
    const csharp = vscode.Uri.file(path.join(dir, 'OrderStateMachine.cs'));
    fs.writeFileSync(csharp.fsPath, SOURCE);
    const target = await vscode.commands.executeCommand<vscode.Uri>(
      'ariadne.importFromCsharp',
      csharp,
      'OrderStateMachine',
    );
    assert.match(fs.readFileSync(target.fsPath, 'utf8'), /name: Submitted/);
  });

  it('exports a PNG with the rasteriser and the font it ships', async () => {
    const diagram = vscode.Uri.file(path.join(dir, 'OrderStateMachine.saga.yaml'));
    const png = await vscode.commands.executeCommand<string>('ariadne.exportPng', diagram);
    const bytes = fs.readFileSync(png);
    assert.deepStrictEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
    assert.ok(bytes.length > 5000, 'with text and shapes in it');
  });
});
