import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (arg: unknown) => void;
const listeners = new Map<string, Listener>();
let findFiles: () => Promise<unknown[]>;

vi.mock('vscode', () => {
  const event = (name: string) => (listener: Listener) => {
    listeners.set(name, listener);
    return { dispose() {} };
  };
  return {
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    Range: class {},
    Diagnostic: class {},
    languages: {
      createDiagnosticCollection: () => ({ set() {}, delete() {}, dispose() {} }),
    },
    workspace: {
      textDocuments: [],
      getWorkspaceFolder: () => undefined,
      findFiles: () => findFiles(),
      createFileSystemWatcher: () => ({
        dispose() {},
        onDidCreate: event('create'),
        onDidChange: event('change'),
        onDidDelete: event('delete'),
      }),
      onDidOpenTextDocument: event('open'),
      onDidSaveTextDocument: event('save'),
      onDidChangeTextDocument: event('typing'),
      onDidCloseTextDocument: event('close'),
    },
  };
});

const { YamlProblems } = await import('./yaml-problems');

const diagram = {
  uri: { scheme: 'file', fsPath: '/w/a.saga.yaml', toString: () => 'file:///w/a' },
  getText: () => '',
};

describe('YamlProblems.idle', () => {
  beforeEach(() => {
    listeners.clear();
    findFiles = async () => [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('is idle when no check is pending', async () => {
    const problems = new YamlProblems();
    await expect(problems.idle()).resolves.toBeUndefined();
  });

  it('waits for the pause after a change, and the check that follows', async () => {
    const problems = new YamlProblems();
    listeners.get('typing')!({ document: diagram });
    let idle = false;
    void problems.idle().then(() => (idle = true));

    await vi.advanceTimersByTimeAsync(299);
    expect(idle).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(idle).toBe(true);
  });

  it('waits for the workspace search of start()', async () => {
    let found!: (uris: unknown[]) => void;
    findFiles = () => new Promise((resolve) => (found = resolve));
    const problems = new YamlProblems();
    void problems.start();
    let idle = false;
    void problems.idle().then(() => (idle = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(idle).toBe(false);

    found([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(idle).toBe(true);
  });

  it('is idle again after dispose', async () => {
    const problems = new YamlProblems();
    listeners.get('typing')!({ document: diagram });
    problems.dispose();
    await expect(problems.idle()).resolves.toBeUndefined();
  });
});
