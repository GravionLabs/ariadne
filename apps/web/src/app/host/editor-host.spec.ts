import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HostMessage } from '@ariadne/editor-protocol';
import { Editor } from '../editor/editor';
import { DiagramStore } from '../model/diagram-store';
import { FileStorage } from '../storage/file-storage';
import { NoFileStorage } from '../storage/no-file-storage';
import { BrowserEditorHost, EditorHost } from './editor-host';
import { VsCodeEditorHost } from './vscode-editor-host';

// jsdom has no ResizeObserver; f-flow uses it to track node sizes.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

describe('BrowserEditorHost', () => {
  it('is the default: not embedded, nothing to tell, nobody to hear', () => {
    const host = TestBed.inject(EditorHost);
    expect(host).toBeInstanceOf(BrowserEditorHost);
    expect(host.embedded).toBe(false);
    host.post({ v: 1, type: 'ready' });
    expect(host.listen(() => {})()).toBeUndefined();
  });
});

describe('VsCodeEditorHost', () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    postMessage.mockClear();
    vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage }));
    TestBed.configureTestingModule({
      providers: [{ provide: EditorHost, useFactory: () => new VsCodeEditorHost() }],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));

  it('is embedded', () => {
    expect(TestBed.inject(EditorHost).embedded).toBe(true);
  });

  it('posts messages through the VS Code API', () => {
    TestBed.inject(EditorHost).post({ v: 1, type: 'edit', text: 'x' });
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: 'edit', text: 'x' });
  });

  it('hands valid messages from the host to the listener', () => {
    const received: HostMessage[] = [];
    TestBed.inject(EditorHost).listen((m) => received.push(m));
    send({ v: 1, type: 'documentChanged', text: 'a' });
    expect(received).toEqual([{ v: 1, type: 'documentChanged', text: 'a' }]);
  });

  it('ignores messages that are not part of the protocol', () => {
    const received: HostMessage[] = [];
    TestBed.inject(EditorHost).listen((m) => received.push(m));
    send({ type: 'documentChanged', text: 'no version' });
    send('hello');
    send({ v: 1, type: 'unknown' });
    expect(received).toEqual([]);
  });

  it('stops listening when asked', () => {
    const received: HostMessage[] = [];
    const stop = TestBed.inject(EditorHost).listen((m) => received.push(m));
    stop();
    send({ v: 1, type: 'theme', kind: 'dark' });
    expect(received).toEqual([]);
  });
});

describe('NoFileStorage', () => {
  it('refuses to read or write files', async () => {
    const storage = new NoFileStorage();
    await expect(storage.open()).rejects.toThrow('handled by the host');
    await expect(storage.save()).rejects.toThrow();
    await expect(storage.saveAs()).rejects.toThrow();
    await expect(storage.openFiles()).rejects.toThrow();
    await expect(storage.saveFiles()).rejects.toThrow();
    await expect(storage.exportFile()).rejects.toThrow();
  });
});

describe('Editor in a host', () => {
  async function render(embedded: boolean) {
    const host = { embedded, post: vi.fn(), listen: () => () => {} };
    await TestBed.configureTestingModule({
      imports: [Editor],
      providers: [
        { provide: EditorHost, useValue: host },
        { provide: FileStorage, useClass: NoFileStorage },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Editor);
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return fixture;
  }

  it('shows the file actions, export and undo on its own', async () => {
    const el = (await render(false)).nativeElement as HTMLElement;
    expect(el.querySelector('nav.file-actions')).not.toBeNull();
    expect(el.querySelector('app-export-menu')).not.toBeNull();
    expect(el.querySelector('[aria-label="Undo"]')).not.toBeNull();
  });

  it('hides the file actions, export, file name, theme toggle and undo inside a host', async () => {
    const fixture = await render(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('nav.file-actions')).toBeNull();
    expect(el.querySelector('app-export-menu')).toBeNull();
    expect(el.querySelector('.file-name')).toBeNull();
    expect(el.querySelector('.theme-toggle')).toBeNull();
    expect(el.querySelector('[aria-label="Undo"]')).toBeNull();
    expect(el.querySelector('[aria-label="Redo"]')).toBeNull();
    expect(fixture.debugElement.query(By.css('f-flow'))).not.toBeNull();
  });

  it('leaves Ctrl+Z and Ctrl+S to the host', async () => {
    await render(true);
    const store = TestBed.inject(DiagramStore);
    store.addNode('state');
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    window.dispatchEvent(save);
    expect(save.defaultPrevented).toBe(false);
  });
});
