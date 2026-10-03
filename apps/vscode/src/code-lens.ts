import * as vscode from 'vscode';
import { findStateMachines } from './state-machines';

/** "Import as saga diagram" above every `MassTransitStateMachine<T>` class. */
export class SagaCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findStateMachines(document.getText()).map(
      (machine) =>
        new vscode.CodeLens(new vscode.Range(machine.line, 0, machine.line, 0), {
          title: 'Ariadne: Import as saga diagram',
          command: 'ariadne.importFromCsharp',
          arguments: [document.uri, machine.name],
        }),
    );
  }
}
