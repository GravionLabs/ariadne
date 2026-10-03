import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import {
  DIAGRAM_EXTENSIONS,
  FileRef,
  FileStorage,
  OpenedFile,
  diagramFileName,
} from './file-storage';

/** Subset of the File System Access API (Chromium only, not in TypeScript's DOM lib yet). */
interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}
interface FilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FileSystemAccessWindow {
  showOpenFilePicker(options?: FilePickerOptions): Promise<FileHandle[]>;
  showSaveFilePicker(options?: FilePickerOptions): Promise<FileHandle>;
}

interface BrowserFileRef extends FileRef {
  readonly handle?: FileHandle;
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
      const content = await (await handle.getFile()).text();
      return { ref: { name: handle.name, handle } as BrowserFileRef, content };
    }
    const file = await this.pickFile();
    return file && { ref: { name: file.name }, content: await file.text() };
  }

  async save(content: string, ref: FileRef): Promise<FileRef | null> {
    const { handle } = ref as BrowserFileRef;
    if (!handle) return this.saveAs(content, ref.name);
    await write(handle, content);
    return ref;
  }

  async saveAs(content: string, suggestedName: string): Promise<FileRef | null> {
    suggestedName = diagramFileName(suggestedName);
    const fs = this.fs;
    if (fs) {
      const handle = await cancelled(fs.showSaveFilePicker({ suggestedName, types: PICKER_TYPES }));
      if (!handle) return null;
      await write(handle, content);
      return { name: handle.name, handle } as BrowserFileRef;
    }
    this.download(content, suggestedName);
    return { name: suggestedName };
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

async function write(handle: FileHandle, content: string | Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
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
