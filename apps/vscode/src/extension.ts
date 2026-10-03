import * as vscode from 'vscode';
import { emptyDiagram, serializeDiagram } from '@ariadne/core';
import { SAGA_EDITOR_VIEW_TYPE, SagaEditorProvider } from './saga-editor-provider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      SAGA_EDITOR_VIEW_TYPE,
      new SagaEditorProvider(context.extensionUri),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: true,
      },
    ),
    vscode.commands.registerCommand('ariadne.openDiagram', (uri?: vscode.Uri) =>
      vscode.commands.executeCommand(
        'vscode.openWith',
        uri ?? vscode.window.activeTextEditor?.document.uri,
        SAGA_EDITOR_VIEW_TYPE,
      ),
    ),
    vscode.commands.registerCommand('ariadne.showAsText', async () => {
      const uri = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      const resource = uri instanceof vscode.TabInputCustom ? uri.uri : undefined;
      if (resource) {
        await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
      }
    }),
    vscode.commands.registerCommand('ariadne.newDiagram', async (folder?: vscode.Uri) => {
      const target = folder ?? vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!target) {
        void vscode.window.showWarningMessage('Open a folder to create a saga diagram in.');
        return;
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Name of the saga',
        value: 'NewSaga',
      });
      if (!name) return;
      const file = vscode.Uri.joinPath(target, `${name}.saga.yaml`);
      await vscode.workspace.fs.writeFile(
        file,
        Buffer.from(serializeDiagram({ ...emptyDiagram(), name })),
      );
      await vscode.commands.executeCommand('vscode.openWith', file, SAGA_EDITOR_VIEW_TYPE);
    }),
  );
}

export function deactivate(): void {}
