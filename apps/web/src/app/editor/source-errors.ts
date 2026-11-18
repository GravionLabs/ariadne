import { locateSourceError as locateInCore } from '@ariadne/core';

/** A position in the source text, 1-based like the line numbers in the editor. */
export interface SourcePosition {
  line: number;
  column: number;
}

/**
 * Where in the source text (YAML or JSON) an error from `parseDiagram` points, or `null` if it
 * cannot be placed. The lookup lives in `@ariadne/core`; the editor needs the start only.
 */
export function locateSourceError(text: string, message: string): SourcePosition | null {
  const at = locateInCore(text, message);
  return at ? { line: at.line, column: at.column } : null;
}
