import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { DiagramFormatError, parseDiagram } from '@ariadne/core';
import { planGeneration, type PlannedFile } from './generate-plan';
import { SAGA_EDITOR_VIEW_TYPE } from './saga-editor-provider';
import type { VirtualDocuments } from './virtual-documents';

/** Which of the files to write; `undefined` cancels. Replaceable, so tests do not need a dialog. */
export type ChooseFiles = (
  files: PlannedFile[],
  title: string,
) => Promise<PlannedFile[] | undefined>;

/** The diagram the command works on: the one given, the one in the active editor. */
export function activeDiagram(uri?: vscode.Uri): vscode.Uri | undefined {
  if (uri instanceof vscode.Uri) return uri;
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (tab instanceof vscode.TabInputCustom && tab.viewType === SAGA_EDITOR_VIEW_TYPE)
    return tab.uri;
  const document = vscode.window.activeTextEditor?.document;
  return document?.uri.fsPath.endsWith('.saga.yaml') ? document.uri : undefined;
}

const readIfThere = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/**
 * "Generate C#": plans the files for the diagram, lets the user pick which to write (changed files
 * can be compared first) and writes them. Returns the files written.
 */
export async function generateCsharpCommand(
  virtual: VirtualDocuments,
  channel: vscode.OutputChannel,
  uri?: vscode.Uri,
  choose: ChooseFiles = (files, title) => pickFiles(virtual, files, title),
): Promise<string[]> {
  const diagramUri = activeDiagram(uri);
  if (!diagramUri) {
    void vscode.window.showWarningMessage('Open a saga diagram (*.saga.yaml) to generate C# for.');
    return [];
  }
  const name = path.basename(diagramUri.fsPath);
  let diagram;
  try {
    // What is in the editor, saved or not.
    diagram = parseDiagram((await vscode.workspace.openTextDocument(diagramUri)).getText());
  } catch (e) {
    const detail = e instanceof DiagramFormatError ? e.message : (e as Error).message;
    void vscode.window.showErrorMessage(`${name} is not a valid saga diagram: ${detail}`);
    return [];
  }

  const config = vscode.workspace.getConfiguration('ariadne.generate', diagramUri);
  const plan = planGeneration(
    diagram,
    diagramUri.fsPath,
    { folder: config.get('folder', ''), namespace: config.get('namespace', '') },
    vscode.workspace.getWorkspaceFolder(diagramUri)?.uri.fsPath,
    readIfThere,
  );
  for (const warning of plan.warnings) channel.appendLine(`${name}: ${warning}`);
  if (plan.warnings.length) channel.show(true);

  const todo = plan.files.filter((f) => f.status !== 'unchanged');
  if (todo.length === 0) {
    void vscode.window.showInformationMessage(`The C# for ${name} is up to date.`);
    return [];
  }
  const chosen = await choose(todo, `Generate C# for ${name}`);
  if (!chosen?.length) return [];

  const written: string[] = [];
  for (const file of chosen) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(file.path)));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(file.path), Buffer.from(file.content));
    written.push(file.path);
  }
  const first = vscode.Uri.file(written[0]!);
  void vscode.window
    .showInformationMessage(
      `Wrote ${written.length} ${written.length === 1 ? 'file' : 'files'} next to ${path.basename(first.fsPath)}.`,
      'Open',
    )
    .then((answer) => (answer ? vscode.window.showTextDocument(first) : undefined));
  return written;
}

interface FileItem extends vscode.QuickPickItem {
  file: PlannedFile;
}

/** A multi-select list: new files are ticked, changed ones show their diff with the button. */
function pickFiles(
  virtual: VirtualDocuments,
  files: PlannedFile[],
  title: string,
): Promise<PlannedFile[] | undefined> {
  const diffButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('diff'),
    tooltip: 'Compare with the file on disk',
  };
  const items: FileItem[] = files.map((file) => ({
    file,
    label: `${file.status === 'new' ? '$(add)' : '$(diff)'} ${path.basename(file.path)}`,
    description: file.status === 'new' ? 'new' : 'replaces the file; compare first',
    detail: path.dirname(file.path),
    picked: file.status === 'new',
    buttons: file.status === 'changed' ? [diffButton] : [],
  }));
  const box = vscode.window.createQuickPick<FileItem>();
  box.title = title;
  box.placeholder = 'Pick the files to write';
  box.canSelectMany = true;
  box.items = items;
  box.selectedItems = items.filter((i) => i.picked);
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: PlannedFile[] | undefined) => {
      if (done) return;
      done = true;
      box.dispose();
      resolve(result);
    };
    box.onDidTriggerItemButton(({ item }) => {
      const generated = virtual.add(
        `${path.basename(item.file.path)} (generated)`,
        item.file.content,
      );
      void vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(item.file.path),
        generated,
        `${path.basename(item.file.path)}: on disk ↔ generated`,
      );
    });
    box.onDidAccept(() => finish(box.selectedItems.map((i) => i.file)));
    box.onDidHide(() => finish(undefined));
    box.show();
  });
}
