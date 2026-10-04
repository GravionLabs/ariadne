import * as path from 'node:path';
import * as vscode from 'vscode';
import { DiagramFormatError, parseDiagram } from '@ariadne/core';
import { activeDiagram } from './generate-command';
import { exportPath, renderExport, type ExportFormat, type Rasterise } from './export-formats';
import { svgToPng } from './png';

/** Formats that are text and can go to the clipboard. */
export type CopyFormat = 'mermaid' | 'markdown';

/** The folder exports go to: `ariadne.export.folder` below the workspace folder, else the diagram's. */
function exportFolder(diagram: vscode.Uri): string {
  const folder = vscode.workspace
    .getConfiguration('ariadne.export', diagram)
    .get<string>('folder', '')
    .trim();
  const root = vscode.workspace.getWorkspaceFolder(diagram)?.uri.fsPath;
  if (folder && root) return path.join(root, ...folder.split(/[\\/]+/).filter(Boolean));
  return path.dirname(diagram.fsPath);
}

/**
 * "Export as …": renders the diagram (as it is in the editor, saved or not) and saves it next to
 * the diagram or in the configured folder, or copies it to the clipboard. Resolves to the file
 * written, or `undefined` when it was copied or could not be done.
 */
export async function exportCommand(
  format: ExportFormat,
  target: 'file' | 'clipboard',
  uri?: vscode.Uri,
  rasterise: Rasterise = svgToPng,
): Promise<string | undefined> {
  const diagramUri = activeDiagram(uri);
  if (!diagramUri) {
    void vscode.window.showWarningMessage('Open a saga diagram (*.saga.yaml) to export.');
    return undefined;
  }
  const name = path.basename(diagramUri.fsPath);
  let diagram;
  try {
    diagram = parseDiagram((await vscode.workspace.openTextDocument(diagramUri)).getText());
  } catch (e) {
    const detail = e instanceof DiagramFormatError ? e.message : (e as Error).message;
    void vscode.window.showErrorMessage(`${name} is not a valid saga diagram: ${detail}`);
    return undefined;
  }

  let exported;
  try {
    exported = await renderExport(diagram, format, diagramUri.fsPath, rasterise);
  } catch (e) {
    void vscode.window.showErrorMessage(`Could not export ${name}: ${(e as Error).message}`);
    return undefined;
  }

  if (target === 'clipboard') {
    await vscode.env.clipboard.writeText(exported.content as string);
    void vscode.window.showInformationMessage(`Copied ${name} as ${labels[format]}.`);
    return undefined;
  }

  const file = exportPath(diagramUri.fsPath, format, exportFolder(diagramUri));
  const content =
    typeof exported.content === 'string' ? Buffer.from(exported.content, 'utf8') : exported.content;
  try {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(file)));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(file), content);
  } catch (e) {
    void vscode.window.showErrorMessage(`Could not write ${file}: ${(e as Error).message}`);
    return undefined;
  }
  void vscode.window
    .showInformationMessage(`Exported ${path.basename(file)}.`, 'Open', 'Reveal')
    .then((answer) => {
      const written = vscode.Uri.file(file);
      if (answer === 'Open') return vscode.commands.executeCommand('vscode.open', written);
      if (answer === 'Reveal') return vscode.commands.executeCommand('revealFileInOS', written);
      return undefined;
    });
  return file;
}

const labels: Record<ExportFormat, string> = {
  mermaid: 'Mermaid',
  svg: 'SVG',
  png: 'PNG',
  markdown: 'Markdown',
};

interface Choice extends vscode.QuickPickItem {
  format: ExportFormat;
  target: 'file' | 'clipboard';
}

/** "Export Diagram…": one list with every way to export. */
export async function exportMenu(uri?: vscode.Uri): Promise<string | undefined> {
  const choices: Choice[] = [
    { label: '$(file-media) SVG image', description: 'save', format: 'svg', target: 'file' },
    { label: '$(file-media) PNG image', description: 'save', format: 'png', target: 'file' },
    { label: '$(markdown) Markdown page', description: 'save', format: 'markdown', target: 'file' },
    { label: '$(graph) Mermaid diagram', description: 'save', format: 'mermaid', target: 'file' },
    {
      label: '$(clippy) Mermaid diagram',
      description: 'copy',
      format: 'mermaid',
      target: 'clipboard',
    },
    {
      label: '$(clippy) Markdown page',
      description: 'copy',
      format: 'markdown',
      target: 'clipboard',
    },
  ];
  const choice = await vscode.window.showQuickPick(choices, {
    placeHolder: 'Export the diagram as…',
  });
  return choice && exportCommand(choice.format, choice.target, uri);
}
