import { parseEditorMessage, parseHostMessage } from './index';

describe('parseHostMessage', () => {
  it('reads init with its settings', () => {
    expect(
      parseHostMessage({
        v: 1,
        type: 'init',
        text: 'x',
        theme: 'dark',
        settings: { autoLayout: false },
      }),
    ).toEqual({ v: 1, type: 'init', text: 'x', theme: 'dark', settings: { autoLayout: false } });
  });

  it('fills missing settings with the defaults', () => {
    const message = parseHostMessage({ v: 1, type: 'init', text: '', theme: 'light' });
    expect(message).toMatchObject({ settings: { autoLayout: true } });
  });

  it('reads documentChanged and theme', () => {
    expect(parseHostMessage({ v: 1, type: 'documentChanged', text: 'a' })).toEqual({
      v: 1,
      type: 'documentChanged',
      text: 'a',
    });
    expect(parseHostMessage({ v: 1, type: 'theme', kind: 'high-contrast' })).toEqual({
      v: 1,
      type: 'theme',
      kind: 'high-contrast',
    });
  });

  it.each([
    null,
    'init',
    42,
    {},
    { type: 'init', text: '', theme: 'dark' },
    { v: 2, type: 'documentChanged', text: '' },
    { v: 1, type: 'documentChanged' },
    { v: 1, type: 'init', text: '', theme: 'sepia' },
    { v: 1, type: 'theme', kind: 'blue' },
    { v: 1, type: 'requestExport', format: 'svg' },
    { v: 1, type: 'edit', text: '' },
  ])('rejects %j', (data) => {
    expect(parseHostMessage(data)).toBeNull();
  });
});

describe('parseEditorMessage', () => {
  it('reads ready, showAsText, edit and error', () => {
    expect(parseEditorMessage({ v: 1, type: 'ready' })).toEqual({ v: 1, type: 'ready' });
    expect(parseEditorMessage({ v: 1, type: 'showAsText' })).toEqual({ v: 1, type: 'showAsText' });
    expect(parseEditorMessage({ v: 1, type: 'edit', text: 'a' })).toEqual({
      v: 1,
      type: 'edit',
      text: 'a',
    });
    expect(parseEditorMessage({ v: 1, type: 'error', message: 'bad' })).toEqual({
      v: 1,
      type: 'error',
      message: 'bad',
    });
  });

  it('reads goToCode with its target', () => {
    expect(
      parseEditorMessage({ v: 1, type: 'goToCode', target: { kind: 'state', id: 'state-1' } }),
    ).toEqual({ v: 1, type: 'goToCode', target: { kind: 'state', id: 'state-1' } });
    expect(
      parseEditorMessage({
        v: 1,
        type: 'goToCode',
        target: { kind: 'transition', id: 'e1', x: 1 },
      }),
    ).toEqual({ v: 1, type: 'goToCode', target: { kind: 'transition', id: 'e1' } });
  });

  it.each([
    { v: 1, type: 'goToCode' },
    { v: 1, type: 'goToCode', target: { kind: 'node', id: 'a' } },
    { v: 1, type: 'goToCode', target: { kind: 'state' } },
    { v: 1, type: 'goToCode', target: 'state-1' },
  ])('rejects the bad goToCode %j', (data) => {
    expect(parseEditorMessage(data)).toBeNull();
  });

  it.each([
    undefined,
    {},
    { v: 1 },
    { v: 0, type: 'ready' },
    { v: 1, type: 'edit' },
    { v: 1, type: 'error', message: 1 },
    { v: 1, type: 'init', text: '', theme: 'dark' },
  ])('rejects %j', (data) => {
    expect(parseEditorMessage(data)).toBeNull();
  });
});
