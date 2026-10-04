import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { PendingWork } from './pending-work';
import { checkDiagramText, type Problem } from './yaml-diagnostics';

const SOURCE = 'Ariadne';
const DEBOUNCE_MS = 300;

const SEVERITIES: Record<Problem['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

const isDiagram = (uri: vscode.Uri): boolean =>
  uri.scheme === 'file' && uri.fsPath.endsWith('.saga.yaml');

/**
 * The Problems panel for `*.saga.yaml`: what the reader rejects and what the validation finds, with
 * line positions. Every diagram of the workspace is checked, open or not and with or without the
 * diagram editor; open ones again on every change (after a short pause) and on save.
 */
export class YamlProblems implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('ariadne-yaml');
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly timers = new Map<string, { timer: NodeJS.Timeout; end: () => void }>();
  private readonly pending = new PendingWork();

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.saga.yaml');
    this.subscriptions.push(
      this.diagnostics,
      watcher,
      // The files of open documents are checked from the editor's text, not from disk.
      watcher.onDidCreate((uri) => this.checkFile(uri)),
      watcher.onDidChange((uri) => this.checkFile(uri)),
      watcher.onDidDelete((uri) => this.diagnostics.delete(uri)),
      vscode.workspace.onDidOpenTextDocument((doc) => this.checkDocument(doc)),
      vscode.workspace.onDidSaveTextDocument((doc) => this.checkDocument(doc)),
      vscode.workspace.onDidChangeTextDocument((e) => this.later(e.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        // A file outside the workspace has no reason to stay in the Problems panel once closed.
        if (isDiagram(doc.uri) && !vscode.workspace.getWorkspaceFolder(doc.uri)) {
          this.diagnostics.delete(doc.uri);
        }
      }),
    );
  }

  /** Checks the diagrams of the workspace and the ones already open. */
  start(): Promise<void> {
    return this.pending.track(this.checkWorkspace());
  }

  /** Resolves once no check is pending: the pause of a change, or a check under way. */
  idle(): Promise<void> {
    return this.pending.idle();
  }

  dispose(): void {
    for (const { timer, end } of this.timers.values()) {
      clearTimeout(timer);
      end();
    }
    this.timers.clear();
    this.subscriptions.forEach((s) => s.dispose());
  }

  private async checkWorkspace(): Promise<void> {
    for (const doc of vscode.workspace.textDocuments) this.checkDocument(doc);
    const files = await vscode.workspace.findFiles('**/*.saga.yaml', '**/node_modules/**');
    for (const uri of files) this.checkFile(uri);
  }

  private later(doc: vscode.TextDocument): void {
    if (!isDiagram(doc.uri)) return;
    const key = doc.uri.toString();
    const before = this.timers.get(key);
    clearTimeout(before?.timer);
    const end = before?.end ?? this.pending.begin();
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.checkDocument(doc);
      end();
    }, DEBOUNCE_MS);
    this.timers.set(key, { timer, end });
  }

  private checkDocument(doc: vscode.TextDocument): void {
    if (isDiagram(doc.uri)) this.publish(doc.uri, doc.getText());
  }

  private checkFile(uri: vscode.Uri): void {
    if (!isDiagram(uri)) return;
    // Open documents are up to date through the events; the disk may be behind.
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) return this.checkDocument(open);
    const end = this.pending.begin();
    fs.readFile(uri.fsPath, 'utf8', (error, text) => {
      if (error) this.diagnostics.delete(uri);
      else this.publish(uri, text);
      end();
    });
  }

  private publish(uri: vscode.Uri, text: string): void {
    let problems: Problem[];
    try {
      problems = checkDiagramText(text);
    } catch (e) {
      // A bug in the check must not hide the file's problems behind a crash.
      problems = [
        {
          severity: 'error',
          message: `The diagram could not be checked: ${(e as Error).message}`,
          range: { line: 0, character: 0, endLine: 0, endCharacter: 0 },
        },
      ];
    }
    this.diagnostics.set(
      uri,
      problems.map((p) => {
        const d = new vscode.Diagnostic(
          new vscode.Range(p.range.line, p.range.character, p.range.endLine, p.range.endCharacter),
          p.message,
          SEVERITIES[p.severity],
        );
        d.source = SOURCE;
        if (p.code) d.code = p.code;
        return d;
      }),
    );
  }
}
