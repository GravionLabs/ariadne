import * as path from 'node:path';
import * as vscode from 'vscode';
import { csharpParser } from './csharp';
import { decideImport, importFromCsharp, type ImportedDiagram } from './import-saga';
import { SAGA_EDITOR_VIEW_TYPE } from './saga-editor-provider';
import type { VirtualDocuments } from './virtual-documents';

/** Warnings of the importer: in the output channel, and as information on the C# lines. */
export class ImportReport {
  readonly channel = vscode.window.createOutputChannel('Ariadne');
  readonly diagnostics = vscode.languages.createDiagnosticCollection('ariadne-import');

  show(csharp: vscode.Uri, warnings: { path: string; line: number; message: string }[]): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const w of warnings) {
      this.channel.appendLine(`${w.path}:${w.line}: ${w.message}`);
      const line = Math.max(0, w.line - 1);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
        w.message,
        vscode.DiagnosticSeverity.Information,
      );
      diagnostic.source = 'Ariadne';
      byFile.set(w.path, [...(byFile.get(w.path) ?? []), diagnostic]);
    }
    this.diagnostics.delete(csharp);
    for (const [file, items] of byFile) this.diagnostics.set(vscode.Uri.file(file), items);
    if (warnings.length) this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
    this.diagnostics.dispose();
  }
}

/** The folder diagrams imported from `csharp` are written to (`ariadne.import.folder`). */
export function importFolder(csharp: vscode.Uri): vscode.Uri {
  const folder = vscode.workspace
    .getConfiguration('ariadne.import', csharp)
    .get<string>('folder', '')
    .trim();
  const root = vscode.workspace.getWorkspaceFolder(csharp)?.uri;
  if (folder && root) return vscode.Uri.joinPath(root, ...folder.split(/[\\/]+/).filter(Boolean));
  return vscode.Uri.file(path.dirname(csharp.fsPath));
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch {
    return undefined;
  }
}

/** The C# file to import: the one given, the active one, or one the user picks. */
async function chooseFile(uri: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
  if (uri) return uri;
  const active = vscode.window.activeTextEditor?.document;
  if (active?.languageId === 'csharp') return active.uri;
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'C# source': ['cs'] },
    openLabel: 'Import saga',
    title: 'Import a saga diagram from a MassTransit state machine',
  });
  return picked?.[0];
}

/**
 * "Import saga from C#": reads the state machine(s) of a file, writes `<Class>.saga.yaml` (showing
 * a diff first when it exists and differs) and opens it in the diagram editor.
 * `className` picks one of several state machines in the file without asking.
 */
export async function importFromCsharpCommand(
  report: ImportReport,
  virtual: VirtualDocuments,
  uri?: vscode.Uri,
  className?: string,
): Promise<vscode.Uri | undefined> {
  const csharp = await chooseFile(uri);
  if (!csharp) return undefined;
  const content = await readText(csharp);
  if (content === undefined) {
    void vscode.window.showErrorMessage(`${csharp.fsPath} could not be read.`);
    return undefined;
  }

  const folder = importFolder(csharp);
  let outcome;
  try {
    outcome = importFromCsharp(csharp.fsPath, content, folder.fsPath, await csharpParser());
  } catch (e) {
    void vscode.window.showErrorMessage(`The C# could not be read: ${(e as Error).message}`);
    return undefined;
  }
  report.show(csharp, outcome.warnings);
  if (outcome.diagrams.length === 0) {
    void vscode.window.showWarningMessage(
      `No MassTransit saga state machine found in ${path.basename(csharp.fsPath)}.`,
    );
    return undefined;
  }

  const imported = await pick(outcome.diagrams, className);
  if (!imported) return undefined;

  const target = vscode.Uri.joinPath(folder, imported.fileName);
  const existing = await readText(target);
  const decision = decideImport(existing, imported.text);
  if (decision === 'confirm') {
    const proposed = virtual.add(`${imported.fileName} (from C#)`, imported.text);
    await vscode.commands.executeCommand(
      'vscode.diff',
      target,
      proposed,
      `${imported.fileName}: current ↔ imported from C#`,
    );
    const answer = await vscode.window.showWarningMessage(
      `${imported.fileName} exists and differs from the code. Replace it with the imported diagram?`,
      'Replace',
    );
    if (answer !== 'Replace') return undefined;
  }
  if (decision !== 'unchanged') {
    await vscode.workspace.fs.createDirectory(folder);
    await vscode.workspace.fs.writeFile(target, Buffer.from(imported.text, 'utf8'));
  }
  await vscode.commands.executeCommand('vscode.openWith', target, SAGA_EDITOR_VIEW_TYPE);
  return target;
}

async function pick(
  diagrams: ImportedDiagram[],
  className: string | undefined,
): Promise<ImportedDiagram | undefined> {
  const named = className ? diagrams.find((d) => d.className === className) : undefined;
  if (named) return named;
  if (diagrams.length === 1) return diagrams[0];
  const choice = await vscode.window.showQuickPick(
    diagrams.map((d) => ({ label: d.className, diagram: d })),
    { placeHolder: 'Which state machine?' },
  );
  return choice?.diagram;
}
