import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parseDiagram } from '@ariadne/core';
import { csharpParser } from './csharp';
import type { CodeTarget } from '@ariadne/editor-protocol';
import { compareWithCode, diagramFromCode, findPlace, sagaLine } from './drift';
import { PendingWork } from './pending-work';
import { resolveSource } from './paths';
import { findStateMachines } from './state-machines';
import type { VirtualDocuments } from './virtual-documents';

const SOURCE = 'Ariadne drift';
const isDiagram = (file: string): boolean => file.endsWith('.saga.yaml');

/** What the last comparison of one diagram and its C# file found. */
interface Pair {
  diagram: string;
  csharp: string;
  diagramDiagnostics: vscode.Diagnostic[];
  csharpDiagnostics: vscode.Diagnostic[];
}

/**
 * Keeps diagram and code from drifting apart unnoticed. Diagrams that name a C# file in
 * `saga.source` are indexed; when either file is saved, the pair is compared and the differences
 * are reported in the Problems panel on both files, with quick fixes to update the diagram from the
 * code or to open a diff. Switched off with `ariadne.drift.enabled`.
 */
export class DriftService implements vscode.CodeActionProvider, vscode.Disposable {
  /** diagram file → the C# file it names, and the class it implements */
  private readonly links = new Map<string, string>();
  private readonly classes = new Map<string, string | undefined>();
  private readonly pairs = new Map<string, Pair>();
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('ariadne-drift');
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly pending = new PendingWork();
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when the links between diagrams and C# files changed (for the CodeLens). */
  readonly onDidChangeLinks = this.changed.event;

  constructor(private readonly virtual: VirtualDocuments) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.saga.yaml');
    this.subscriptions.push(
      this.diagnostics,
      this.changed,
      watcher,
      watcher.onDidCreate((uri) => void this.indexFile(uri.fsPath)),
      watcher.onDidChange((uri) => void this.indexFile(uri.fsPath)),
      watcher.onDidDelete((uri) => this.forget(uri.fsPath)),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (isDiagram(doc.uri.fsPath)) this.index(doc.uri.fsPath, doc.getText());
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => void this.saved(doc)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('ariadne.drift.enabled')) return;
        if (this.enabled()) void this.checkAll();
        else this.clear();
      }),
      vscode.languages.registerCodeActionsProvider(
        [{ pattern: '**/*.saga.yaml' }, { pattern: '**/*.cs' }],
        this,
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
      ),
      vscode.commands.registerCommand('ariadne.updateDiagramFromCode', (uri: vscode.Uri) =>
        this.updateDiagramFromCode(uri),
      ),
      vscode.commands.registerCommand('ariadne.openDriftDiff', (uri: vscode.Uri) =>
        this.openDiff(uri),
      ),
    );
  }

  /** Finds the diagrams of the workspace. */
  start(): Promise<void> {
    return this.pending.track(this.findDiagrams());
  }

  /** Resolves once nothing is pending: indexing, and the comparisons that follow a save. */
  idle(): Promise<void> {
    return this.pending.idle();
  }

  private async findDiagrams(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.saga.yaml', '**/node_modules/**');
    await Promise.all(files.map((f) => this.indexFile(f.fsPath)));
  }

  /** The diagram that implements `className` in this C# file (the first, if there are several). */
  diagramFor(csharp: string, className: string): string | undefined {
    return this.diagramsFor(csharp).find((d) => {
      const wanted = this.classes.get(d);
      return wanted === undefined || wanted === className;
    });
  }

  /** The diagrams that name this C# file. */
  diagramsFor(csharp: string): string[] {
    return [...this.links].filter(([, cs]) => cs === csharp).map(([diagram]) => diagram);
  }

  /** The current differences of a pair, for the tests. */
  messages(diagram: string): string[] {
    return this.pairs.get(diagram)?.diagramDiagnostics.map((d) => d.message) ?? [];
  }

  /** Compares a diagram with its code now. */
  check(diagram: string): Promise<void> {
    return this.pending.track(this.compare(diagram));
  }

  private async compare(diagram: string): Promise<void> {
    const csharp = this.links.get(diagram);
    if (!csharp || !this.enabled(vscode.Uri.file(diagram))) {
      this.pairs.delete(diagram);
      this.publish();
      return;
    }
    const [diagramText, csharpText] = await Promise.all([this.text(diagram), this.text(csharp)]);
    if (diagramText === undefined) return;
    const make = (message: string, line: number): vscode.Diagnostic => {
      const d = new vscode.Diagnostic(
        new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
        message,
        vscode.DiagnosticSeverity.Warning,
      );
      d.source = SOURCE;
      return d;
    };
    const pair: Pair = { diagram, csharp, diagramDiagnostics: [], csharpDiagnostics: [] };
    const sourceLine = sagaLine(diagramText, 'source');
    if (csharpText === undefined) {
      pair.diagramDiagnostics.push(
        make(`The C# file ${path.basename(csharp)} cannot be read.`, sourceLine),
      );
    } else {
      try {
        const result = compareWithCode(diagramText, csharp, csharpText, await csharpParser());
        if (result.kind === 'problem') {
          pair.diagramDiagnostics.push(make(result.message, sourceLine));
        } else if (result.kind === 'compared') {
          const machine = findStateMachines(csharpText).find(
            (m) => m.name === result.code.className,
          );
          const codeLine = machine?.line ?? 0;
          const name = path.basename(diagram);
          for (const difference of result.differences) {
            pair.diagramDiagnostics.push(make(difference.message, sourceLine));
            pair.csharpDiagnostics.push(make(`${difference.message} (diagram ${name})`, codeLine));
          }
        }
      } catch (e) {
        pair.diagramDiagnostics.push(
          make(`Could not compare with the code: ${(e as Error).message}`, sourceLine),
        );
      }
    }
    if (pair.diagramDiagnostics.length) this.pairs.set(diagram, pair);
    else this.pairs.delete(diagram);
    this.publish();
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (!context.diagnostics.some((d) => d.source === SOURCE)) return [];
    const file = document.uri.fsPath;
    const diagrams = isDiagram(file)
      ? [file]
      : [...this.pairs.values()].filter((p) => p.csharp === file).map((p) => p.diagram);
    return diagrams.flatMap((diagram) => {
      const uri = vscode.Uri.file(diagram);
      const suffix = isDiagram(file) ? '' : ` (${path.basename(diagram)})`;
      const update = new vscode.CodeAction(
        `Update diagram from code${suffix}`,
        vscode.CodeActionKind.QuickFix,
      );
      update.command = {
        title: update.title,
        command: 'ariadne.updateDiagramFromCode',
        arguments: [uri],
      };
      update.diagnostics = context.diagnostics.filter((d) => d.source === SOURCE);
      const diff = new vscode.CodeAction(`Open diff${suffix}`, vscode.CodeActionKind.QuickFix);
      diff.command = { title: diff.title, command: 'ariadne.openDriftDiff', arguments: [uri] };
      diff.diagnostics = update.diagnostics;
      return [update, diff];
    });
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
  }

  // ---- commands

  private async imported(diagram: vscode.Uri) {
    const csharp = this.links.get(diagram.fsPath);
    const [diagramText, csharpText] = await Promise.all([
      this.text(diagram.fsPath),
      csharp ? this.text(csharp) : undefined,
    ]);
    if (!csharp || diagramText === undefined || csharpText === undefined) {
      void vscode.window.showWarningMessage('The diagram or its C# file cannot be read.');
      return undefined;
    }
    const imported = diagramFromCode(
      diagramText,
      path.dirname(diagram.fsPath),
      csharp,
      csharpText,
      await csharpParser(),
    );
    if (!imported) {
      void vscode.window.showWarningMessage(
        `The state machine of ${path.basename(diagram.fsPath)} is not in ${path.basename(csharp)}.`,
      );
    }
    return imported && { imported, diagramText };
  }

  /** Replaces the text of the diagram with the diagram the code describes; undo brings it back. */
  async updateDiagramFromCode(diagram: vscode.Uri): Promise<boolean> {
    const found = await this.imported(diagram);
    if (!found) return false;
    const document = await vscode.workspace.openTextDocument(diagram);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      diagram,
      new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
      found.imported.text,
    );
    return vscode.workspace.applyEdit(edit);
  }

  /** "Go to code": opens the C# of the diagram at a state or transition. */
  async goToCode(diagram: vscode.Uri, target: CodeTarget): Promise<void> {
    const csharp = this.links.get(diagram.fsPath);
    const [diagramText, csharpText] = await Promise.all([
      this.text(diagram.fsPath),
      csharp ? this.text(csharp) : undefined,
    ]);
    if (!csharp || diagramText === undefined) {
      void vscode.window.showInformationMessage(
        'This diagram names no C# file. Set the C# file in the saga details (saga.source).',
      );
      return;
    }
    if (csharpText === undefined) {
      void vscode.window.showWarningMessage(`${path.basename(csharp)} cannot be read.`);
      return;
    }
    const place = findPlace(diagramText, csharp, csharpText, await csharpParser(), target);
    if (!place) {
      void vscode.window.showInformationMessage(
        `That ${target.kind} has no place in ${path.basename(csharp)}.`,
      );
      return;
    }
    const line = Math.max(0, place.line - 1);
    await vscode.window.showTextDocument(vscode.Uri.file(csharp), {
      selection: new vscode.Range(line, 0, line, 0),
      preview: false,
    });
  }

  async openDiff(diagram: vscode.Uri): Promise<void> {
    const found = await this.imported(diagram);
    if (!found) return;
    const name = path.basename(diagram.fsPath);
    const fromCode = this.virtual.add(`${name} (from code)`, found.imported.text);
    await vscode.commands.executeCommand(
      'vscode.diff',
      diagram,
      fromCode,
      `${name}: diagram ↔ imported from the code`,
    );
  }

  // ---- index

  private enabled(scope?: vscode.Uri): boolean {
    return vscode.workspace.getConfiguration('ariadne.drift', scope).get('enabled', true);
  }

  private saved(doc: vscode.TextDocument): Promise<void> {
    return this.pending.track(this.compareSaved(doc));
  }

  private async compareSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.enabled(doc.uri)) return;
    const file = doc.uri.fsPath;
    if (isDiagram(file)) {
      this.index(file, doc.getText());
      await this.check(file);
    } else {
      await Promise.all(this.diagramsFor(file).map((d) => this.check(d)));
    }
  }

  private async checkAll(): Promise<void> {
    await Promise.all([...this.links.keys()].map((d) => this.check(d)));
  }

  private indexFile(file: string): Promise<void> {
    return this.pending.track(this.readAndIndex(file));
  }

  private async readAndIndex(file: string): Promise<void> {
    const text = await this.text(file);
    if (text === undefined) this.forget(file);
    else this.index(file, text);
  }

  private index(file: string, text: string): void {
    let source: string | undefined;
    let className: string | undefined;
    try {
      const saga = parseDiagram(text).saga;
      source = saga?.source;
      className = saga?.className;
    } catch {
      source = undefined;
    }
    const before = this.links.get(file);
    const next = source ? resolveSource(path.dirname(file), source) : undefined;
    if (next === before && className === this.classes.get(file)) return;
    this.classes.set(file, className);
    if (next) this.links.set(file, next);
    else {
      this.classes.delete(file);
      this.links.delete(file);
      this.pairs.delete(file);
      this.publish();
    }
    this.changed.fire();
  }

  private forget(file: string): void {
    if (this.links.delete(file)) this.changed.fire();
    this.pairs.delete(file);
    this.publish();
  }

  /** Text of a file: the open document (saved or not), else the disk. */
  private async text(file: string): Promise<string | undefined> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
    if (open) return open.getText();
    try {
      return await fs.promises.readFile(file, 'utf8');
    } catch {
      return undefined;
    }
  }

  private clear(): void {
    this.pairs.clear();
    this.diagnostics.clear();
  }

  private publish(): void {
    this.diagnostics.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    const add = (file: string, items: vscode.Diagnostic[]) =>
      byFile.set(file, [...(byFile.get(file) ?? []), ...items]);
    for (const pair of this.pairs.values()) {
      add(pair.diagram, pair.diagramDiagnostics);
      add(pair.csharp, pair.csharpDiagnostics);
    }
    for (const [file, items] of byFile) this.diagnostics.set(vscode.Uri.file(file), items);
  }
}
