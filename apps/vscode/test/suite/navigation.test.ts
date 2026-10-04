import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface OpenEditor {
  uri: vscode.Uri;
  session: { receive(data: unknown): void };
}
interface Api {
  openEditors(): OpenEditor[];
}

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
  for (let i = 0; i < 200; i++) {
    const found = probe();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const lensesOf = async (uri: vscode.Uri) => {
  await vscode.workspace.openTextDocument(uri);
  return vscode.commands.executeCommand<vscode.CodeLens[]>(
    'vscode.executeCodeLensProvider',
    uri,
    100,
  );
};

describe('Code navigation', () => {
  let dir: string;
  let csharp: vscode.Uri;
  let api: Api;

  beforeEach(async () => {
    api = (await vscode.extensions
      .getExtension<Api>('gravionlabs.ariadne-vscode')!
      .activate()) as Api;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-nav-'));
    csharp = vscode.Uri.file(path.join(dir, 'OrderStateMachine.cs'));
    fs.writeFileSync(csharp.fsPath, SOURCE);
  });

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('offers "Import" until a diagram links the class, then "Open saga diagram"', async () => {
    const before = await lensesOf(csharp);
    assert.deepStrictEqual(
      before.map((l) => l.command?.title),
      ['Ariadne: Import as saga diagram'],
    );

    const diagram = await vscode.commands.executeCommand<vscode.Uri>(
      'ariadne.importFromCsharp',
      csharp,
      'OrderStateMachine',
    );
    await vscode.workspace.openTextDocument(diagram);
    // The lenses are asked again when the links change; look until the new one is there.
    let lens: vscode.CodeLens | undefined;
    for (let i = 0; !lens && i < 80; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const first = (await lensesOf(csharp))[0];
      if (first?.command?.title === 'Ariadne: Open saga diagram') lens = first;
    }
    assert.ok(lens, 'the lens opens the diagram');
    assert.strictEqual(lens.command?.command, 'ariadne.openDiagram');
    assert.strictEqual((lens.command?.arguments?.[0] as vscode.Uri).fsPath, diagram.fsPath);

    await vscode.commands.executeCommand(lens.command!.command, ...lens.command!.arguments!);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom);
    assert.strictEqual(input.uri.fsPath, diagram.fsPath);
  });

  it('opens the C# at the state or transition asked for in the diagram', async () => {
    const diagram = await vscode.commands.executeCommand<vscode.Uri>(
      'ariadne.importFromCsharp',
      csharp,
      'OrderStateMachine',
    );
    const editor = await until('the diagram editor', () =>
      api.openEditors().find((e) => e.uri.fsPath === diagram.fsPath),
    );
    const text = fs.readFileSync(diagram.fsPath, 'utf8');
    const id = (name: string) =>
      new RegExp(`- id: (\\S+)\\n    type: state\\n    name: ${name}`).exec(text)![1]!;

    editor.session.receive({
      v: 1,
      type: 'goToCode',
      target: { kind: 'state', id: id('Submitted') },
    });
    // The editor opens first and the selection follows: wait for the line.
    // `public State Submitted …` is on line 20 (index 19).
    await until('the C# at the state', () => {
      const e = vscode.window.activeTextEditor;
      return e?.document.uri.fsPath === csharp.fsPath && e.selection.active.line === 19;
    });

    const edge =
      /- id: (\S+)\n    source: \S+\n    target: \S+\n    kind: forward\n    event: OrderShipped/.exec(
        text,
      )![1]!;
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    editor.session.receive({ v: 1, type: 'goToCode', target: { kind: 'transition', id: edge } });
    const during = await until('the C# at the transition', () => {
      const e = vscode.window.activeTextEditor;
      return e?.document.uri.fsPath === csharp.fsPath && e;
    });
    assert.match(during.document.lineAt(during.selection.active.line).text, /OrderShipped/);
  });
});
