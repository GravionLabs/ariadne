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

  /**
   * Saves a generated file (an image export), always asking where; it is not a diagram, so it
   * does not become the open file. Resolves to `null` when the user cancels.
   */
  abstract exportFile(content: Blob, suggestedName: string): Promise<FileRef | null>;
}

/**
 * Diagram files are named `*.saga.yaml`: the double extension tells them apart from every other
 * YAML file, in file dialogs, in the OS and for editor integrations (ADR 0002).
 */
export const DIAGRAM_EXTENSIONS = ['.saga.yaml'];

/** Plain YAML names that are still read; saving under a new name gives them the diagram extension. */
export const LEGACY_EXTENSIONS = ['.yaml', '.yml'];

export const UNTITLED_NAME = 'untitled.saga.yaml';

/**
 * The name to save a diagram under: `order` and `order.yaml` become `order.saga.yaml`, a name that
 * already ends in `.saga.yaml` is kept, and an empty name becomes {@link UNTITLED_NAME}.
 */
export function diagramFileName(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (DIAGRAM_EXTENSIONS.some((e) => lower.endsWith(e) && lower.length > e.length)) return trimmed;
  const legacy = LEGACY_EXTENSIONS.find((e) => lower.endsWith(e) && lower.length > e.length);
  const base = legacy ? trimmed.slice(0, -legacy.length) : trimmed.replace(/\.+$/, '');
  return base ? `${base}${DIAGRAM_EXTENSIONS[0]}` : UNTITLED_NAME;
}
