import * as vscode from 'vscode';
import { findStateMachines } from './state-machines';

/** What the lenses need to know about the diagrams of the workspace. */
export interface DiagramLinks {
  /** The diagram that implements `className` in this C# file. */
  diagramFor(csharp: string, className: string): string | undefined;
  readonly onDidChangeLinks: vscode.Event<void>;
}

/**
 * Above every `MassTransitStateMachine<T>` class: "Open saga diagram" when a diagram names the class
 * (`saga.source`), else "Import as saga diagram".
 */
export class SagaCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly links: DiagramLinks) {
    this.subscription = links.onDidChangeLinks(() => this.changed.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findStateMachines(document.getText()).map((machine) => {
      const range = new vscode.Range(machine.line, 0, machine.line, 0);
      const diagram = this.links.diagramFor(document.uri.fsPath, machine.name);
      return new vscode.CodeLens(
        range,
        diagram
          ? {
              title: 'Ariadne: Open saga diagram',
              command: 'ariadne.openDiagram',
              arguments: [vscode.Uri.file(diagram)],
            }
          : {
              title: 'Ariadne: Import as saga diagram',
              command: 'ariadne.importFromCsharp',
              arguments: [document.uri, machine.name],
            },
      );
    });
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
