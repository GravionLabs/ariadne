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

const drift = (uri: vscode.Uri) =>
  vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'Ariadne drift');

async function until<T>(what: string, probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const found = probe();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** Replaces the text of a file in the editor and saves it, like a user would. */
async function rewrite(uri: vscode.Uri, text: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), text);
  await vscode.workspace.applyEdit(edit);
  await document.save();
}

describe('Drift diagnostics', () => {
  let dir: string;
  let csharp: vscode.Uri;
  let diagram: vscode.Uri;

  beforeEach(async () => {
    await vscode.extensions.getExtension('gravionlabs.ariadne-vscode')!.activate();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ariadne-drift-'));
    csharp = vscode.Uri.file(path.join(dir, 'OrderStateMachine.cs'));
    fs.writeFileSync(csharp.fsPath, SOURCE);
    diagram = await vscode.commands.executeCommand<vscode.Uri>(
      'ariadne.importFromCsharp',
      csharp,
      'OrderStateMachine',
    );
    // Opening the diagram as text registers it; the saved pair agrees.
    await vscode.workspace.openTextDocument(diagram);
    await vscode.workspace.openTextDocument(csharp);
  });

  afterEach(async () => {
    await vscode.workspace
      .getConfiguration('ariadne.drift')
      .update('enabled', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const drifted = SOURCE.replace(
    'During(Submitted, When(OrderShipped).Finalize());',
    'During(Submitted, When(OrderShipped).TransitionTo(Shipped));\n        During(Shipped, When(OrderDelivered).Finalize());',
  )
    .replace(
      'public State Submitted',
      'public State Shipped { get; private set; }\n    public State Submitted',
    )
    .replace(
      'public Event<OrderShipped>',
      'public Event<OrderDelivered> OrderDelivered { get; private set; }\n    public Event<OrderShipped>',
    );

  it('reports nothing for a diagram and code that agree', async () => {
    await rewrite(csharp, SOURCE);
    await rewrite(diagram, fs.readFileSync(diagram.fsPath, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepStrictEqual(drift(diagram), []);
    assert.deepStrictEqual(drift(csharp), []);
  });

  it('reports the differences on both files when the code is saved', async () => {
    await rewrite(csharp, drifted);
    const onDiagram = await until('the diagram problems', () => {
      const found = drift(diagram);
      return found.length > 0 && found;
    });
    assert.ok(onDiagram.some((d) => /Shipped/.test(d.message)));
    assert.strictEqual(onDiagram[0]!.severity, vscode.DiagnosticSeverity.Warning);
    const onCode = await until('the code problems', () => {
      const found = drift(csharp);
      return found.length > 0 && found;
    });
    assert.ok(onCode.some((d) => /in the code, not in the diagram/.test(d.message)));
    // On the line of the class.
    assert.strictEqual(onCode[0]!.range.start.line, 10);
  });

  it('reports the differences when the diagram is saved', async () => {
    const text = fs.readFileSync(diagram.fsPath, 'utf8');
    await rewrite(diagram, text.replace('name: Submitted', 'name: Accepted'));
    await until('the problems', () => drift(csharp).length > 0);
    assert.ok(drift(diagram).some((d) => /Submitted|Accepted/.test(d.message)));
  });

  it('offers "Update diagram from code" and "Open diff", and the update clears the problems', async () => {
    await rewrite(csharp, drifted);
    await until('the problems', () => drift(diagram).length > 0);
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      diagram,
      new vscode.Range(0, 0, 200, 0),
      vscode.CodeActionKind.QuickFix.value,
    );
    const titles = actions.map((a) => a.title);
    assert.ok(titles.includes('Update diagram from code'), titles.join(' | '));
    assert.ok(titles.includes('Open diff'), titles.join(' | '));

    const update = actions.find((a) => a.title === 'Update diagram from code')!;
    await vscode.commands.executeCommand(
      update.command!.command,
      ...(update.command!.arguments ?? []),
    );
    const document = await vscode.workspace.openTextDocument(diagram);
    assert.match(document.getText(), /name: Shipped/);
    await document.save();
    await until('no problems', () => drift(diagram).length === 0 && drift(csharp).length === 0);
  });

  it('opens a diff of the diagram and the code', async () => {
    await rewrite(csharp, drifted);
    await until('the problems', () => drift(diagram).length > 0);
    await vscode.commands.executeCommand('ariadne.openDriftDiff', diagram);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff);
    assert.strictEqual(input.original.fsPath, diagram.fsPath);
  });

  it('can be switched off', async () => {
    await vscode.workspace
      .getConfiguration('ariadne.drift')
      .update('enabled', false, vscode.ConfigurationTarget.Global);
    await rewrite(csharp, drifted);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepStrictEqual(drift(diagram), []);
    assert.deepStrictEqual(drift(csharp), []);
  });

  it('says so when the C# file no longer has the state machine', async () => {
    await rewrite(csharp, 'public class Other {}');
    const found = await until('the problem', () => {
      const d = drift(diagram);
      return d.length > 0 && d;
    });
    assert.match(found[0]!.message, /OrderStateMachine is not in/);
  });
});
