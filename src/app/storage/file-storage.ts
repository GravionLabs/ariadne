/** A file the user opened or saved; implementations may attach a native handle. */
export interface FileRef {
  readonly name: string;
}

export interface OpenedFile {
  readonly ref: FileRef;
  readonly content: string;
}

/**
 * Platform-neutral access to local diagram files. The web build uses
 * {@link BrowserFileStorage}; the Tauri shell provides its own implementation.
 * Methods resolve to `null` when the user cancels a dialog.
 */
export abstract class FileStorage {
  abstract open(): Promise<OpenedFile | null>;

  /** Writes to `ref` in place when possible, otherwise asks where to save. */
  abstract save(content: string, ref: FileRef): Promise<FileRef | null>;

  /** Always asks where to save. */
  abstract saveAs(content: string, suggestedName: string): Promise<FileRef | null>;
}

export const DIAGRAM_EXTENSIONS = ['.yaml', '.yml'];
