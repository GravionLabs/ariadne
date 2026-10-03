import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

const fixture = (name: string) =>
  vscode.Uri.file(path.resolve(__dirname, '..', '..', 'test', 'fixtures', name));

describe('Ariadne extension', () => {
  it('registers its commands', async () => {
    await vscode.extensions.getExtension('gravionlabs.ariadne-vscode')?.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['ariadne.newDiagram', 'ariadne.openDiagram', 'ariadne.showAsText']) {
      assert.ok(commands.includes(id), `${id} is registered`);
    }
  });

  it('opens a *.saga.yaml in the saga editor by default', async () => {
    await vscode.commands.executeCommand('vscode.open', fixture('order.saga.yaml'));
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom);
    assert.strictEqual(input.viewType, 'ariadne.sagaEditor');
  });

  it('shows the same file as text with "Show as Text"', async () => {
    await vscode.commands.executeCommand('vscode.open', fixture('order.saga.yaml'));
    await vscode.commands.executeCommand('ariadne.showAsText');
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputText);
  });
});
