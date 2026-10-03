import { TestBed } from '@angular/core/testing';
import { BrowserFileStorage } from './browser-file-storage';

/** The File System Access API is not in jsdom; the storage only needs these two functions. */
interface PickerWindow {
  showOpenFilePicker?: unknown;
  showSaveFilePicker?: unknown;
}

describe('BrowserFileStorage', () => {
  const win = window as unknown as PickerWindow;
  let storage: BrowserFileStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [BrowserFileStorage] });
    storage = TestBed.inject(BrowserFileStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete win.showOpenFilePicker;
    delete win.showSaveFilePicker;
  });

  describe('with the File System Access API', () => {
    const handle = (name: string, text = '') => ({
      name,
      getFile: async () => new File([text], name),
      createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    });

    it('opens with a *.saga.yaml filter, and keeps the "All files" option for older files', async () => {
      const open = vi.fn(async () => [handle('order.yaml', 'version: 3\n')]);
      win.showOpenFilePicker = open;
      win.showSaveFilePicker = vi.fn();

      const opened = await storage.open();

      expect(open).toHaveBeenCalledTimes(1);
      const [options] = open.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(options['types']).toEqual([
        {
          description: 'Ariadne diagram (*.saga.yaml)',
          accept: { 'application/yaml': ['.saga.yaml'] },
        },
      ]);
      expect(options['excludeAcceptAllOption']).toBeUndefined();
      // A plain .yaml file opens just the same.
      expect(opened?.ref.name).toBe('order.yaml');
      expect(opened?.content).toBe('version: 3\n');
    });

    it('picks several files to read, filtered to their extension', async () => {
      const open = vi.fn(async () => [handle('A.cs', 'class A {}'), handle('B.cs', 'class B {}')]);
      win.showOpenFilePicker = open;
      win.showSaveFilePicker = vi.fn();

      const files = await storage.openFiles({
        extensions: ['.cs'],
        description: 'C# source files',
      });

      expect(files).toEqual([
        { name: 'A.cs', content: 'class A {}' },
        { name: 'B.cs', content: 'class B {}' },
      ]);
      const [options] = open.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(options['multiple']).toBe(true);
      expect(options['types']).toEqual([
        { description: 'C# source files', accept: { 'text/plain': ['.cs'] } },
      ]);
    });

    it('returns null when picking files is cancelled', async () => {
      win.showOpenFilePicker = vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      });
      win.showSaveFilePicker = vi.fn();
      expect(await storage.openFiles({ extensions: ['.cs'], description: 'C#' })).toBeNull();
    });

    it('exports an image through the save picker, filtered to its extension', async () => {
      const save = vi.fn(async () => handle('order.png'));
      win.showOpenFilePicker = vi.fn();
      win.showSaveFilePicker = save;

      const ref = await storage.exportFile(new Blob(['x'], { type: 'image/png' }), 'order.png');

      const [options] = save.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(options['suggestedName']).toBe('order.png');
      expect(options['types']).toEqual([
        { description: 'PNG image', accept: { 'image/png': ['.png'] } },
      ]);
      expect(ref).toEqual({ name: 'order.png' });
    });

    it('returns null when the export picker is cancelled', async () => {
      win.showOpenFilePicker = vi.fn();
      win.showSaveFilePicker = vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      });
      expect(
        await storage.exportFile(new Blob(['x'], { type: 'image/svg+xml' }), 'a.svg'),
      ).toBeNull();
    });

    it('suggests a *.saga.yaml name when saving as', async () => {
      const save = vi.fn(async () => handle('order.saga.yaml'));
      win.showOpenFilePicker = vi.fn();
      win.showSaveFilePicker = save;

      const ref = await storage.saveAs('text', 'order.yaml');

      const [options] = save.mock.calls[0] as unknown as [{ suggestedName: string }];
      expect(options.suggestedName).toBe('order.saga.yaml');
      expect(ref?.name).toBe('order.saga.yaml');
    });

    it('returns null when the dialog is cancelled', async () => {
      const abort = () => Promise.reject(new DOMException('cancelled', 'AbortError'));
      win.showOpenFilePicker = abort;
      win.showSaveFilePicker = abort;
      expect(await storage.open()).toBeNull();
      expect(await storage.saveAs('text', 'order')).toBeNull();
    });
  });

  describe('without it (download fallback)', () => {
    it('downloads under a *.saga.yaml name', async () => {
      const created: HTMLAnchorElement[] = [];
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'a') {
          created.push(el as HTMLAnchorElement);
          (el as HTMLAnchorElement).click = vi.fn();
        }
        return el;
      });
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();

      const ref = await storage.saveAs('text', 'order');

      expect(created[0].download).toBe('order.saga.yaml');
      expect(ref).toEqual({ name: 'order.saga.yaml' });
    });

    it('downloads an exported image under its own name', async () => {
      const created: HTMLAnchorElement[] = [];
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'a') {
          created.push(el as HTMLAnchorElement);
          (el as HTMLAnchorElement).click = vi.fn();
        }
        return el;
      });
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();

      const ref = await storage.exportFile(
        new Blob(['<svg/>'], { type: 'image/svg+xml' }),
        'order.svg',
      );

      expect(created[0].download).toBe('order.svg');
      expect(ref).toEqual({ name: 'order.svg' });
    });

    it('lets the file input pick *.saga.yaml files', async () => {
      let input: HTMLInputElement | undefined;
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'input') {
          input = el as HTMLInputElement;
          input.click = () => input!.dispatchEvent(new Event('cancel'));
        }
        return el;
      });
      expect(await storage.open()).toBeNull();
      expect(input?.accept).toBe('.saga.yaml');
    });

    it('lets the file input pick several files', async () => {
      let input: HTMLInputElement | undefined;
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'input') {
          input = el as HTMLInputElement;
          input.click = () => {
            Object.defineProperty(input, 'files', {
              value: [new File(['class A {}'], 'A.cs'), new File(['class B {}'], 'B.cs')],
            });
            input!.dispatchEvent(new Event('change'));
          };
        }
        return el;
      });
      const files = await storage.openFiles({ extensions: ['.cs'], description: 'C#' });
      expect(files?.map((f) => f.name)).toEqual(['A.cs', 'B.cs']);
      expect(input?.multiple).toBe(true);
      expect(input?.accept).toBe('.cs');
    });

    it('returns null when no file is picked', async () => {
      const realCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag);
        if (tag === 'input') el.click = () => el.dispatchEvent(new Event('cancel'));
        return el;
      });
      expect(await storage.openFiles({ extensions: ['.cs'], description: 'C#' })).toBeNull();
    });
  });
});
