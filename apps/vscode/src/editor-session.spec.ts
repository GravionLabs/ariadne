import type { HostMessage } from '@ariadne/editor-protocol';
import { EditorSession, type SessionDocument, type SessionView } from './editor-session';

function setup(initial = 'a') {
  let text = initial;
  const posted: HostMessage[] = [];
  const shown: string[] = [];
  const failures: string[] = [];
  const answers: (() => void)[] = [];
  let apply = (next: string) => {
    text = next;
    return true;
  };
  const document: SessionDocument = {
    getText: () => text,
    replaceText: async (next) => {
      const ok = apply(next);
      // VS Code reports the change after the edit is applied.
      if (ok) queueMicrotask(() => session.documentChanged());
      return ok;
    },
  };
  const view: SessionView = {
    post: (m) => posted.push(m),
    theme: () => 'dark',
    settings: () => ({ autoLayout: true }),
    showAsText: vi.fn(),
    goToCode: vi.fn(),
    showError: (m) => shown.push(m),
    editFailed: (m) => {
      failures.push(m);
      return new Promise<void>((resolve) => answers.push(resolve));
    },
  };
  const session = new EditorSession(document, view);
  return {
    session,
    posted,
    shown,
    failures,
    answerFailure: () => answers.shift()?.(),
    view,
    text: () => text,
    setText: (next: string) => (text = next),
    failWith: (fn: (next: string) => boolean) => (apply = fn),
  };
}

describe('EditorSession', () => {
  it('answers ready with the document, theme and settings', () => {
    const { session, posted } = setup('x: 1');
    session.receive({ v: 1, type: 'ready' });
    expect(posted).toEqual([
      { v: 1, type: 'init', text: 'x: 1', theme: 'dark', settings: { autoLayout: true } },
    ]);
  });

  it('writes an edit of the webview into the document, without echoing it back', async () => {
    const { session, posted, text } = setup();
    session.receive({ v: 1, type: 'edit', text: 'b' });
    await session.idle();
    await Promise.resolve();
    expect(text()).toBe('b');
    expect(posted).toEqual([]);
  });

  it('applies several edits in order and echoes none of them', async () => {
    const { session, posted, text } = setup();
    for (const next of ['b', 'c', 'd']) session.receive({ v: 1, type: 'edit', text: next });
    await session.idle();
    await Promise.resolve();
    expect(text()).toBe('d');
    expect(posted).toEqual([]);
  });

  it('does not touch the document for an edit that changes nothing', async () => {
    const { session, text, failWith } = setup('same');
    failWith(() => {
      throw new Error('must not be written');
    });
    session.receive({ v: 1, type: 'edit', text: 'same' });
    await session.idle();
    expect(text()).toBe('same');
  });

  it('sends changes from anywhere else to the webview', () => {
    const { session, posted, setText } = setup();
    setText('from git');
    session.documentChanged();
    expect(posted).toEqual([{ v: 1, type: 'documentChanged', text: 'from git' }]);
  });

  it('sends an undo of its own edit to the webview', async () => {
    const { session, posted, setText } = setup('a');
    session.receive({ v: 1, type: 'edit', text: 'b' });
    await session.idle();
    await Promise.resolve();
    setText('a'); // Ctrl+Z in VS Code
    session.documentChanged();
    expect(posted).toEqual([{ v: 1, type: 'documentChanged', text: 'a' }]);
  });

  it('does not swallow a later outside change after a refused edit', async () => {
    const { session, posted, setText, failWith } = setup('a');
    failWith(() => false);
    session.receive({ v: 1, type: 'edit', text: 'b' });
    await session.idle();
    setText('b');
    session.documentChanged();
    expect(posted).toEqual([{ v: 1, type: 'documentChanged', text: 'b' }]);
  });

  it('reports an edit that could not be applied and keeps going', async () => {
    const { session, failures, text, setText, failWith } = setup('a');
    failWith(() => {
      throw new Error('read-only');
    });
    session.receive({ v: 1, type: 'edit', text: 'b' });
    await session.idle();
    expect(failures).toEqual(['The change could not be saved: read-only']);
    failWith((next) => {
      setText(next);
      return true;
    });
    session.receive({ v: 1, type: 'edit', text: 'c' });
    await session.idle();
    expect(text()).toBe('c');
  });

  it('reports an edit that VS Code did not apply', async () => {
    const { session, failures, text, failWith } = setup('a');
    failWith(() => false);
    session.receive({ v: 1, type: 'edit', text: 'b' });
    await session.idle();
    expect(failures).toEqual([
      'The change could not be saved: VS Code did not apply it (the file may be read-only).',
    ]);
    expect(text()).toBe('a');
  });

  it('shows one message for a run of failed edits, and the next one after it was answered', async () => {
    const { session, failures, answerFailure, failWith } = setup('a');
    failWith(() => false);
    for (const next of ['b', 'c', 'd']) session.receive({ v: 1, type: 'edit', text: next });
    await session.idle();
    expect(failures).toHaveLength(1);
    answerFailure();
    await Promise.resolve();
    await Promise.resolve();
    session.receive({ v: 1, type: 'edit', text: 'e' });
    await session.idle();
    expect(failures).toHaveLength(2);
  });

  it('keeps going when the failure message itself fails', async () => {
    const { session, view, failWith } = setup('a');
    const editFailed = vi.fn(() => Promise.reject(new Error('no window')));
    view.editFailed = editFailed;
    failWith(() => false);
    session.receive({ v: 1, type: 'edit', text: 'b' });
    await session.idle();
    await Promise.resolve();
    await Promise.resolve();
    session.receive({ v: 1, type: 'edit', text: 'c' });
    await session.idle();
    // Not stuck: the next failure is reported again.
    expect(editFailed).toHaveBeenCalledTimes(2);
  });

  it('reverts the webview to the document on request', () => {
    const { session, posted, setText } = setup('a');
    setText('what the file says');
    session.revert();
    expect(posted).toEqual([{ v: 1, type: 'documentChanged', text: 'what the file says' }]);
  });

  it('opens the text editor on request and shows errors of the webview', () => {
    const { session, view, shown } = setup();
    session.receive({ v: 1, type: 'showAsText' });
    session.receive({ v: 1, type: 'error', message: 'broken' });
    expect(view.showAsText).toHaveBeenCalled();
    expect(shown).toEqual(['broken']);
  });

  it('passes "Go to code" on to the host window', () => {
    const { session, view } = setup();
    session.receive({ v: 1, type: 'goToCode', target: { kind: 'state', id: 'state-1' } });
    expect(view.goToCode).toHaveBeenCalledWith({ kind: 'state', id: 'state-1' });
  });

  it('ignores messages that are not part of the protocol', () => {
    const { session, posted, shown } = setup();
    session.receive({ type: 'edit', text: 'no version' });
    session.receive('ready');
    session.receive(undefined);
    expect(posted).toEqual([]);
    expect(shown).toEqual([]);
  });

  it('sends the theme when it changes', () => {
    const { session, posted } = setup();
    session.themeChanged();
    expect(posted).toEqual([{ v: 1, type: 'theme', kind: 'dark' }]);
  });
});
