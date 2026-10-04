import { TestBed } from '@angular/core/testing';
import { BrowserFileStorage } from './browser-file-storage';

/** The File System Access API is not in jsdom; the storage only needs these two functions. */
interface PickerWindow {
  showDirectoryPicker?: unknown;
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
    delete win.showDirectoryPicker;
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

    it('writes several files into the folder the user picks', async () => {
      const written = new Map<string, string>();
      const directory = {
        getFileHandle: async (name: string) => ({
          name,
          createWritable: async () => ({
            write: async (data: string) => void written.set(name, data),
            close: vi.fn(),
          }),
        }),
      };
      win.showDirectoryPicker = vi.fn(async () => directory);

      const saved = await storage.saveFiles(
        [
          { name: 'A.cs', content: 'class A {}' },
          { name: 'B.cs', content: 'class B {}' },
        ],
        'order',
      );

      expect(saved).toBe(true);
      expect(Object.fromEntries(written)).toEqual({ 'A.cs': 'class A {}', 'B.cs': 'class B {}' });
    });

    it('saves nothing when the folder picker is cancelled', async () => {
      win.showDirectoryPicker = vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      });
      expect(await storage.saveFiles([{ name: 'A.cs', content: 'x' }], 'order')).toBe(false);
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

    it('downloads several files as one zip', async () => {
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
      let blob: Blob | undefined;
      URL.createObjectURL = vi.fn((b: Blob) => {
        blob = b;
        return 'blob:x';
      });
      URL.revokeObjectURL = vi.fn();

      const saved = await storage.saveFiles([{ name: 'A.cs', content: 'class A {}' }], 'order');

      expect(saved).toBe(true);
      expect(created[0].download).toBe('order.zip');
      expect(blob?.type).toBe('application/zip');
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

describe('BrowserFileStorage, saving safely', () => {
  const win = window as unknown as PickerWindow;
  let storage: BrowserFileStorage;

  /** A file that was last changed at `modified`, and what is written to it. */
  function fileOnDisk(name: string, modified: number, failWith?: Error) {
    const state = { modified, text: 'old', written: [] as string[] };
    const writable = {
      write: vi.fn(async (data: string) => {
        if (failWith) throw failWith;
        state.written.push(data);
      }),
      close: vi.fn(async () => {
        state.text = state.written.join('');
        state.modified += 1000;
      }),
      abort: vi.fn(async () => {
        state.written.length = 0;
      }),
    };
    const handle = {
      name,
      getFile: async () => new File([state.text], name, { lastModified: state.modified }),
      // Every write starts from an empty swap file.
      createWritable: async () => {
        state.written.length = 0;
        return writable;
      },
    };
    return { state, writable, handle };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [BrowserFileStorage] });
    storage = TestBed.inject(BrowserFileStorage);
    win.showSaveFilePicker = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete win.showOpenFilePicker;
    delete win.showSaveFilePicker;
  });

  const openFile = async (disk: ReturnType<typeof fileOnDisk>) => {
    win.showOpenFilePicker = vi.fn(async () => [disk.handle]);
    return (await storage.open())!;
  };

  it('aborts the write when it fails, so the old file stays as it was, and says why', async () => {
    const disk = fileOnDisk('a.saga.yaml', 1000, new Error('disk full'));
    const { ref } = await openFile(disk);
    await expect(storage.save('new', ref)).rejects.toThrow('disk full');
    expect(disk.writable.abort).toHaveBeenCalledTimes(1);
    expect(disk.writable.close).not.toHaveBeenCalled();
    expect(disk.state.text).toBe('old');
  });

  it('still reports the write error when aborting fails too', async () => {
    const disk = fileOnDisk('a.saga.yaml', 1000, new Error('disk full'));
    disk.writable.abort.mockRejectedValue(new Error('cannot abort'));
    const { ref } = await openFile(disk);
    await expect(storage.save('new', ref)).rejects.toThrow('disk full');
  });

  it('saves in place when the file is as it was opened, and notes the new time', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const disk = fileOnDisk('a.saga.yaml', 1000);
    const { ref } = await openFile(disk);

    const saved = await storage.save('new', ref);

    expect(confirm).not.toHaveBeenCalled();
    expect(disk.state.text).toBe('new');
    // The next save compares with the time of this one, not of the first open.
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(await storage.save('newer', saved!)).not.toBeNull();
    expect(disk.state.text).toBe('newer');
  });

  describe('when the file changed on disk since it was opened', () => {
    it('writes over it when the user says so', async () => {
      const disk = fileOnDisk('a.saga.yaml', 1000);
      const { ref } = await openFile(disk);
      disk.state.modified = 5000;
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

      expect(await storage.save('mine', ref)).not.toBeNull();

      expect(confirm).toHaveBeenCalledWith(
        'a.saga.yaml changed on disk since you opened it. Overwrite it?',
      );
      expect(disk.state.text).toBe('mine');
    });

    it('leaves the file alone, and the edits unsaved, when the user says no', async () => {
      const disk = fileOnDisk('a.saga.yaml', 1000);
      const { ref } = await openFile(disk);
      disk.state.modified = 5000;
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      expect(await storage.save('mine', ref)).toBeNull();

      expect(disk.writable.write).not.toHaveBeenCalled();
      expect(disk.state.text).toBe('old');
    });
  });

  it('does not ask when the file cannot be read any more (it was deleted)', async () => {
    const disk = fileOnDisk('a.saga.yaml', 1000);
    const { ref } = await openFile(disk);
    disk.handle.getFile = async () => {
      throw new DOMException('gone', 'NotFoundError');
    };
    const confirm = vi.spyOn(window, 'confirm');
    await storage.save('mine', ref);
    expect(confirm).not.toHaveBeenCalled();
  });
});
