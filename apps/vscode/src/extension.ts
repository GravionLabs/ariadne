import * as vscode from 'vscode';
import { emptyDiagram, serializeDiagram } from '@ariadne/core';
import { SagaCodeLensProvider } from './code-lens';
import { readFileSync } from 'node:fs';
import type MarkdownItClass from 'markdown-it';
import { sagaPlugin } from './markdown-saga';
import { exportCommand, exportMenu } from './export-command';
import type { ExportFormat, Rasterise } from './export-formats';
import { DriftService } from './drift-service';
import { generateCsharpCommand, type ChooseFiles } from './generate-command';
import { ImportReport, importFromCsharpCommand } from './import-command';
import { YamlProblems } from './yaml-problems';
import { VIRTUAL_SCHEME, VirtualDocuments } from './virtual-documents';
import { OpenEditor, SAGA_EDITOR_VIEW_TYPE, SagaEditorProvider } from './saga-editor-provider';

/** What the extension exports; the integration tests drive the editors through it. */
export interface AriadneApi {
  openEditors(): OpenEditor[];
  /** "Generate C#" with the choice of files given, instead of asking. */
  generateCsharp(uri: vscode.Uri, choose: ChooseFiles): Promise<string[]>;
  /** The drift service, to compare now instead of waiting for a save. */
  drift: DriftService;
  /** The hook of VS Code's Markdown preview (`markdown.markdownItPlugins`). */
  extendMarkdownIt(md: InstanceType<typeof MarkdownItClass>): InstanceType<typeof MarkdownItClass>;
  /** An export with the rasteriser given (the real one needs the built assets). */
  exportDiagram(
    format: ExportFormat,
    target: 'file' | 'clipboard',
    uri: vscode.Uri,
    rasterise?: Rasterise,
  ): Promise<string | undefined>;
}

export function activate(context: vscode.ExtensionContext): AriadneApi {
  const virtual = new VirtualDocuments();
  const report = new ImportReport();
  const drift = new DriftService(virtual);
  const provider = new SagaEditorProvider(context.extensionUri, (uri, target) =>
    drift.goToCode(uri, target),
  );
  const lenses = new SagaCodeLensProvider(drift);
  void drift.start();
  const problems = new YamlProblems();
  void problems.start();
  context.subscriptions.push(
    report,
    drift,
    problems,
    vscode.workspace.registerTextDocumentContentProvider(VIRTUAL_SCHEME, virtual),
    vscode.languages.registerCodeLensProvider({ pattern: '**/*.cs' }, lenses),
    lenses,
    ...(
      [
        ['ariadne.exportMermaid', 'mermaid', 'file'],
        ['ariadne.exportSvg', 'svg', 'file'],
        ['ariadne.exportPng', 'png', 'file'],
        ['ariadne.exportMarkdown', 'markdown', 'file'],
        ['ariadne.copyMermaid', 'mermaid', 'clipboard'],
        ['ariadne.copyMarkdown', 'markdown', 'clipboard'],
      ] as const
    ).map(([command, format, target]) =>
      vscode.commands.registerCommand(command, (uri?: vscode.Uri) =>
        exportCommand(format, target, uri instanceof vscode.Uri ? uri : undefined),
      ),
    ),
    vscode.commands.registerCommand('ariadne.export', (uri?: vscode.Uri) =>
      exportMenu(uri instanceof vscode.Uri ? uri : undefined),
    ),
    vscode.commands.registerCommand('ariadne.generateCsharp', (uri?: vscode.Uri) =>
      generateCsharpCommand(virtual, report.channel, uri),
    ),
    vscode.commands.registerCommand(
      'ariadne.importFromCsharp',
      (uri?: vscode.Uri, className?: string) =>
        importFromCsharpCommand(
          report,
          virtual,
          uri instanceof vscode.Uri ? uri : undefined,
          className,
        ),
    ),
    vscode.window.registerCustomEditorProvider(SAGA_EDITOR_VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
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
  return {
    openEditors: () => [...provider.open],
    drift,
    extendMarkdownIt: (md) =>
      sagaPlugin(md, {
        readFile: (file) => {
          try {
            return readFileSync(file, 'utf8');
          } catch {
            return undefined;
          }
        },
        fallbackFolder: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      }),
    exportDiagram: (format, target, uri, rasterise) =>
      exportCommand(format, target, uri, rasterise),
    generateCsharp: (uri, choose) => generateCsharpCommand(virtual, report.channel, uri, choose),
  };
}

export function deactivate(): void {}
