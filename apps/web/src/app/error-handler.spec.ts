import { ErrorHandler, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ErrorBanner } from './error-banner';
import { AppErrorHandler, AppErrors } from './error-handler';
import { EditorHost } from './host/editor-host';
import { DiagramStore } from './model/diagram-store';
import { FileStorage } from './storage/file-storage';
import { serializeDiagram } from '@ariadne/core';

@Component({
  selector: 'app-boom',
  template: '<button (click)="boom()">Boom</button>',
})
class Boom {
  boom(): never {
    throw new Error('exploded in a click handler');
  }
}

class FakeStorage extends FileStorage {
  saved: { content: string; name: string }[] = [];
  open = vi.fn(async () => null);
  openFiles = vi.fn(async () => null);
  saveFiles = vi.fn(async () => true);
  save = vi.fn(async () => null);
  saveAs = vi.fn(async (content: string, name: string) => {
    this.saved.push({ content, name });
    return { name };
  });
  exportFile = vi.fn(async () => null);
}

function setup(options: { embedded?: boolean } = {}) {
  TestBed.configureTestingModule({
    // Without this the test bed rethrows what the application's error handler is meant to catch.
    rethrowApplicationErrors: false,
    providers: [
      { provide: ErrorHandler, useClass: AppErrorHandler },
      { provide: FileStorage, useClass: FakeStorage },
      ...(options.embedded
        ? [{ provide: EditorHost, useValue: { embedded: true, post() {}, listen: () => () => {} } }]
        : []),
    ],
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const errors = TestBed.inject(AppErrors);
  const store = TestBed.inject(DiagramStore);
  const storage = TestBed.inject(FileStorage) as FakeStorage;
  return { errors, store, storage, handler: TestBed.inject(ErrorHandler) };
}

describe('AppErrorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the error for the banner, and still logs it', () => {
    const { errors, handler } = setup();
    handler.handleError(new Error('something broke'));
    expect(errors.current()).toEqual({ message: 'something broke' });
    expect(console.error).toHaveBeenCalled();
  });

  it('names a thrown string, an event and any other value', () => {
    const { errors, handler } = setup();
    handler.handleError('plain text');
    expect(errors.current()?.message).toBe('plain text');
    handler.handleError(new ErrorEvent('error', { message: 'from the window' }));
    expect(errors.current()?.message).toBe('from the window');
    handler.handleError({ code: 7 });
    expect(errors.current()?.message).toBe('{"code":7}');
  });

  it('ignores the harmless resize observer notice', () => {
    const { errors, handler } = setup();
    handler.handleError(new Error('ResizeObserver loop completed with undelivered notifications.'));
    expect(errors.current()).toBeNull();
  });

  it('never touches the diagram', () => {
    const { store, handler } = setup();
    store.addNode('state');
    const before = store.diagram();
    handler.handleError(new Error('x'));
    expect(store.diagram()).toBe(before);
  });
});

describe('ErrorBanner', () => {
  afterEach(() => vi.restoreAllMocks());

  const banner = (fixture: { nativeElement: unknown }) =>
    (fixture.nativeElement as HTMLElement).querySelector('.banner');
  const button = (fixture: { nativeElement: unknown }, label: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
    ) as HTMLButtonElement | undefined;

  it('shows nothing until something goes wrong', async () => {
    setup();
    const fixture = TestBed.createComponent(ErrorBanner);
    await fixture.whenStable();
    expect(banner(fixture)).toBeNull();
  });

  it('shows an error thrown by an event handler, and the diagram is unchanged', async () => {
    const { store } = setup();
    store.addNode('state');
    const before = store.diagram();
    const bannerFixture = TestBed.createComponent(ErrorBanner);
    const boom = TestBed.createComponent(Boom);
    await boom.whenStable();
    (boom.nativeElement as HTMLElement).querySelector('button')!.click();
    await bannerFixture.whenStable();

    const el = banner(bannerFixture)!;
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.textContent).toContain('Something went wrong. Your diagram is still here.');
    expect(el.textContent).toContain('exploded in a click handler');
    expect(store.diagram()).toBe(before);
  });

  it('copies the diagram to the clipboard', async () => {
    const { store, errors } = setup();
    store.addNode('state');
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const fixture = TestBed.createComponent(ErrorBanner);
    errors.report(new Error('x'));
    await fixture.whenStable();

    button(fixture, 'Copy diagram')!.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(serializeDiagram(store.diagram()));
    expect(banner(fixture)!.textContent).toContain('The diagram is on the clipboard.');
    vi.unstubAllGlobals();
  });

  it('says so when the clipboard is not available, and points to the download', async () => {
    const { errors } = setup();
    vi.stubGlobal('navigator', {});
    const fixture = TestBed.createComponent(ErrorBanner);
    errors.report(new Error('x'));
    await fixture.whenStable();

    button(fixture, 'Copy diagram')!.click();
    await fixture.whenStable();

    expect(banner(fixture)!.textContent).toContain('The diagram could not be copied');
    expect(banner(fixture)!.textContent).toContain('Download a copy instead.');
    vi.unstubAllGlobals();
  });

  it('downloads a copy of the diagram under the name of the file', async () => {
    const { store, errors, storage } = setup();
    store.addNode('state');
    const fixture = TestBed.createComponent(ErrorBanner);
    errors.report(new Error('x'));
    await fixture.whenStable();

    button(fixture, 'Download a copy')!.click();
    await fixture.whenStable();

    expect(storage.saved).toEqual([
      { content: serializeDiagram(store.diagram()), name: 'untitled.saga.yaml' },
    ]);
    expect(banner(fixture)!.textContent).toContain('A copy was saved as untitled.saga.yaml.');
  });

  it('says why a copy could not be saved', async () => {
    const { errors, storage } = setup();
    storage.saveAs.mockRejectedValue(new Error('no permission'));
    const fixture = TestBed.createComponent(ErrorBanner);
    errors.report(new Error('x'));
    await fixture.whenStable();

    button(fixture, 'Download a copy')!.click();
    await fixture.whenStable();

    expect(banner(fixture)!.textContent).toContain('A copy could not be saved: no permission.');
  });

  it('is dismissed, and a new error starts afresh', async () => {
    const { errors } = setup();
    vi.stubGlobal('navigator', {});
    const fixture = TestBed.createComponent(ErrorBanner);
    errors.report(new Error('first'));
    await fixture.whenStable();
    button(fixture, 'Copy diagram')!.click();
    await fixture.whenStable();
    expect(banner(fixture)!.textContent).toContain('could not be copied');

    errors.report(new Error('second'));
    await fixture.whenStable();
    expect(banner(fixture)!.textContent).toContain('second');
    expect(banner(fixture)!.textContent).not.toContain('could not be copied');

    button(fixture, 'Dismiss error')!.click();
    await fixture.whenStable();
    expect(banner(fixture)).toBeNull();
    vi.unstubAllGlobals();
  });

  it('offers no download in a host, which owns the files', async () => {
    const { errors } = setup({ embedded: true });
    const fixture = TestBed.createComponent(ErrorBanner);
    errors.report(new Error('x'));
    await fixture.whenStable();
    expect(button(fixture, 'Copy diagram')).toBeDefined();
    expect(button(fixture, 'Download a copy')).toBeUndefined();
  });
});
