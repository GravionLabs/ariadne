import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { zipFiles } from './zip';
import {
  DIAGRAM_EXTENSIONS,
  FileRef,
  FileStorage,
  OpenedFile,
  PickFilesOptions,
  TextFile,
  diagramFileName,
} from './file-storage';

/** Subset of the File System Access API (Chromium only, not in TypeScript's DOM lib yet). */
interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
    /** Throws the pending write away: the file stays as it was. */
    abort?(): Promise<void>;
  }>;
}
interface FilePickerOptions {
  suggestedName?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface DirectoryHandle {
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandle>;
}
interface FileSystemAccessWindow {
  showDirectoryPicker?(options?: { mode?: 'readwrite' }): Promise<DirectoryHandle>;
  showOpenFilePicker(options?: FilePickerOptions): Promise<FileHandle[]>;
  showSaveFilePicker(options?: FilePickerOptions): Promise<FileHandle>;
}

interface BrowserFileRef extends FileRef {
  readonly handle?: FileHandle;
  /** `lastModified` of the file when it was opened or last saved by us: to notice other writers. */
  readonly modified?: number;
}

// The pickers keep their "All files" option, so older `.yaml` / `.yml` diagrams can still be opened.
const PICKER_TYPES = [
  {
    description: 'Ariadne diagram (*.saga.yaml)',
    accept: { 'application/yaml': DIAGRAM_EXTENSIONS },
  },
];

/**
 * Browser {@link FileStorage}: uses the File System Access API where available (save in
 * place), otherwise falls back to a file input for opening and a download for saving.
 */
@Injectable()
export class BrowserFileStorage extends FileStorage {
  private readonly document = inject(DOCUMENT);

  private get fs(): FileSystemAccessWindow | undefined {
    const win = this.document.defaultView as unknown as Partial<FileSystemAccessWindow> | null;
    return win?.showOpenFilePicker && win.showSaveFilePicker
      ? (win as FileSystemAccessWindow)
      : undefined;
  }

  async open(): Promise<OpenedFile | null> {
    const fs = this.fs;
    if (fs) {
      const [handle] = (await cancelled(fs.showOpenFilePicker({ types: PICKER_TYPES }))) ?? [];
      if (!handle) return null;
      const file = await handle.getFile();
      const content = await file.text();
      return {
        ref: { name: handle.name, handle, modified: file.lastModified } as BrowserFileRef,
        content,
      };
    }
    const file = await this.pickFile();
    return file && { ref: { name: file.name }, content: await file.text() };
  }

  async openFiles(options: PickFilesOptions): Promise<TextFile[] | null> {
    const fs = this.fs;
    let files: File[] | null;
    if (fs) {
      const handles = await cancelled(
        fs.showOpenFilePicker({
          multiple: true,
          types: [
            { description: options.description, accept: { 'text/plain': [...options.extensions] } },
          ],
        }),
      );
      files = handles && (await Promise.all(handles.map((h) => h.getFile())));
    } else {
      files = await this.pickFiles(options.extensions);
    }
    if (!files?.length) return null;
    return Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
  }

  async save(content: string, ref: FileRef): Promise<FileRef | null> {
    const { handle, modified } = ref as BrowserFileRef;
    if (!handle) return this.saveAs(content, ref.name);
    if (modified !== undefined && !(await this.confirmOverwrite(handle, modified))) return null;
    await write(handle, content);
    return { name: ref.name, handle, modified: await modifiedOf(handle) } as BrowserFileRef;
  }

  async saveAs(content: string, suggestedName: string): Promise<FileRef | null> {
    suggestedName = diagramFileName(suggestedName);
    const fs = this.fs;
    if (fs) {
      const handle = await cancelled(fs.showSaveFilePicker({ suggestedName, types: PICKER_TYPES }));
      if (!handle) return null;
      await write(handle, content);
      return { name: handle.name, handle, modified: await modifiedOf(handle) } as BrowserFileRef;
    }
    this.download(content, suggestedName);
    return { name: suggestedName };
  }

  async saveFiles(files: readonly TextFile[], folderName: string): Promise<boolean> {
    const picker = (this.document.defaultView as unknown as Partial<FileSystemAccessWindow> | null)
      ?.showDirectoryPicker;
    if (picker) {
      const directory = await cancelled(
        picker.call(this.document.defaultView, { mode: 'readwrite' }),
      );
      if (!directory) return false;
      for (const file of files) {
        await write(await directory.getFileHandle(file.name, { create: true }), file.content);
      }
      return true;
    }
    this.downloadBlob(
      new Blob([zipFiles(files)], { type: 'application/zip' }),
      `${folderName}.zip`,
    );
    return true;
  }

  async exportFile(content: Blob, suggestedName: string): Promise<FileRef | null> {
    const fs = this.fs;
    if (fs) {
      const extension = suggestedName.slice(suggestedName.lastIndexOf('.'));
      const handle = await cancelled(
        fs.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: `${extension.slice(1).toUpperCase()} ${content.type.startsWith('image/') ? 'image' : 'file'}`,
              accept: { [content.type]: [extension] },
            },
          ],
        }),
      );
      if (!handle) return null;
      await write(handle, content);
      return { name: handle.name };
    }
    this.downloadBlob(content, suggestedName);
    return { name: suggestedName };
  }

  /**
   * Saving over a file that changed on disk since we opened it (another editor, a `git pull`)
   * would silently throw that change away, so the user is asked first. Not asked when the file
   * cannot be read (it was deleted): the write then decides what happens.
   */
  private async confirmOverwrite(handle: FileHandle, opened: number): Promise<boolean> {
    const now = await modifiedOf(handle);
    if (now === undefined || now <= opened) return true;
    return (
      this.document.defaultView?.confirm(
        `${handle.name} changed on disk since you opened it. Overwrite it?`,
      ) ?? true
    );
  }

  private pickFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = this.document.createElement('input');
      input.type = 'file';
      input.accept = DIAGRAM_EXTENSIONS.join(',');
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  private pickFiles(extensions: readonly string[]): Promise<File[] | null> {
    return new Promise((resolve) => {
      const input = this.document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = extensions.join(',');
      input.addEventListener('change', () => resolve(input.files ? [...input.files] : null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  private download(content: string, name: string): void {
    this.downloadBlob(new Blob([content], { type: 'application/yaml' }), name);
  }

  private downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }
}

/**
 * Writes the whole file or none of it: the browser writes to a swap file that replaces the real one
 * on `close()`, so a failure must `abort()` it to leave the old file as it was.
 */
async function write(handle: FileHandle, content: string | Blob): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (e) {
    await writable.abort?.().catch(() => undefined);
    throw e;
  }
}

/** When the file was last changed, or `undefined` when it cannot be read. */
async function modifiedOf(handle: FileHandle): Promise<number | undefined> {
  try {
    return (await handle.getFile()).lastModified;
  } catch {
    return undefined;
  }
}

/** Maps the picker's AbortError (user cancelled) to `null`. */
async function cancelled<T>(picker: Promise<T>): Promise<T | null> {
  try {
    return await picker;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}
