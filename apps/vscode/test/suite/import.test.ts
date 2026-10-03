import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

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

async function activate(): Promise<void> {
  await vscode.extensions.getExtension('gravionlabs.ariadne-vscode')!.activate();
}

describe('Import from C#', () => {
  let dir: string;
  let csharp: vscode.Uri;

  beforeEach(async () => {
    await activate();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-import-'));
    fs.mkdirSync(path.join(dir, 'Sagas'));
    csharp = vscode.Uri.file(path.join(dir, 'Sagas', 'OrderStateMachine.cs'));
    fs.writeFileSync(csharp.fsPath, SOURCE);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('offers "Import as saga diagram" above the state machine class', async () => {
    await vscode.workspace.openTextDocument(csharp);
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      csharp,
      100,
    );
    const lens = lenses.find((l) => l.command?.command === 'ariadne.importFromCsharp');
    assert.ok(lens, 'a lens for the import');
    assert.strictEqual(lens.command?.title, 'Ariadne: Import as saga diagram');
    assert.strictEqual(lens.range.start.line, 10);
  });

  it('writes <Class>.saga.yaml next to the class, records the source and opens the diagram', async () => {
    const target = await vscode.commands.executeCommand<vscode.Uri>(
      'ariadne.importFromCsharp',
      csharp,
      'OrderStateMachine',
    );
    assert.strictEqual(target.fsPath, path.join(dir, 'Sagas', 'OrderStateMachine.saga.yaml'));
    const text = fs.readFileSync(target.fsPath, 'utf8');
    assert.match(text, /^saga:\n {2}class: OrderStateMachine/m);
    assert.match(text, /^ {2}source: OrderStateMachine\.cs$/m);
    assert.match(text, /name: Submitted/);

    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom);
    assert.strictEqual(input.viewType, 'ariadne.sagaEditor');
    assert.strictEqual(input.uri.fsPath, target.fsPath);
  });

  it('does not rewrite a diagram that is already the same', async () => {
    const first = await vscode.commands.executeCommand<vscode.Uri>(
      'ariadne.importFromCsharp',
      csharp,
      'OrderStateMachine',
    );
    const before = fs.statSync(first.fsPath).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await vscode.commands.executeCommand('ariadne.importFromCsharp', csharp, 'OrderStateMachine');
    assert.strictEqual(fs.statSync(first.fsPath).mtimeMs, before);
  });

  it('reports a file without a state machine and writes nothing', async () => {
    const plain = vscode.Uri.file(path.join(dir, 'Plain.cs'));
    fs.writeFileSync(plain.fsPath, 'public class Plain {}');
    const target = await vscode.commands.executeCommand('ariadne.importFromCsharp', plain);
    assert.strictEqual(target, undefined);
    assert.ok(!fs.existsSync(path.join(dir, 'Plain.saga.yaml')));
  });
});
