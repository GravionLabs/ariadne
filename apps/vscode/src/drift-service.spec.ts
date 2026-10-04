import { describe, expect, it, vi } from 'vitest';

let findFiles: () => Promise<unknown[]>;

vi.mock('vscode', () => {
  const event = () => () => ({ dispose() {} });
  return {
    EventEmitter: class {
      event = event();
      fire() {}
      dispose() {}
    },
    CodeActionKind: { QuickFix: { value: 'quickfix' } },
    languages: {
      createDiagnosticCollection: () => ({ set() {}, clear() {}, dispose() {} }),
      registerCodeActionsProvider: () => ({ dispose() {} }),
    },
    commands: { registerCommand: () => ({ dispose() {} }) },
    workspace: {
      textDocuments: [],
      findFiles: () => findFiles(),
      getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
      createFileSystemWatcher: () => ({
        dispose() {},
        onDidCreate: event(),
        onDidChange: event(),
        onDidDelete: event(),
      }),
      onDidOpenTextDocument: event(),
      onDidSaveTextDocument: event(),
      onDidChangeConfiguration: event(),
    },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
  };
});

const { DriftService } = await import('./drift-service');

describe('DriftService.idle', () => {
  it('is idle when nothing is pending', async () => {
    const drift = new DriftService({} as never);
    await expect(drift.idle()).resolves.toBeUndefined();
  });

  it('waits for the indexing of start()', async () => {
    let found!: (uris: unknown[]) => void;
    findFiles = () => new Promise((resolve) => (found = resolve));
    const drift = new DriftService({} as never);
    void drift.start();
    let idle = false;
    void drift.idle().then(() => (idle = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(idle).toBe(false);

    found([]);
    await drift.idle();
    expect(idle).toBe(true);
  });

  it('waits for a comparison started by check()', async () => {
    const drift = new DriftService({} as never);
    const check = drift.check('/w/none.saga.yaml');
    await drift.idle();
    await expect(check).resolves.toBeUndefined();
  });
});
