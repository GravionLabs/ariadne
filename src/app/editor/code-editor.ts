import { InjectionToken } from '@angular/core';

/** A text editor for the source panel. Hides the editor library, so it can be loaded lazily. */
export interface CodeEditor {
  /** Replaces the text from outside (the user's cursor and scroll position are kept if possible). */
  setText(text: string): void;
  focus(): void;
  /** Marks a problem at a position (1-based) with a message, or removes the mark with `null`. */
  showError(error: { message: string; line: number; column: number } | null): void;
  /** Puts the cursor at a position (1-based) and scrolls it into view. */
  reveal(line: number, column: number): void;
  destroy(): void;
}

export interface CodeEditorOptions {
  text: string;
  /** The user changed the text. Not called for {@link CodeEditor.setText}. */
  onChange(text: string): void;
  /** The editor lost focus. */
  onBlur(): void;
}

export type CodeEditorFactory = (
  parent: HTMLElement,
  options: CodeEditorOptions,
) => Promise<CodeEditor>;

/**
 * Creates the editor. The CodeMirror based implementation is loaded on first use, so it is not
 * part of the initial bundle; specs provide a fake.
 */
export const CODE_EDITOR_FACTORY = new InjectionToken<CodeEditorFactory>('CODE_EDITOR_FACTORY', {
  providedIn: 'root',
  factory: () => (parent, options) =>
    import('./codemirror-editor').then((m) => m.createCodeMirrorEditor(parent, options)),
});

/**
 * The smallest single edit that turns `from` into `to`: the common start and end are kept, so a
 * cursor or selection outside the changed part is not disturbed.
 */
export function minimalChange(
  from: string,
  to: string,
): { from: number; to: number; insert: string } {
  let start = 0;
  const shortest = Math.min(from.length, to.length);
  while (start < shortest && from[start] === to[start]) start++;
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) {
    endFrom--;
    endTo--;
  }
  return { from: start, to: endFrom, insert: to.slice(start, endTo) };
}
