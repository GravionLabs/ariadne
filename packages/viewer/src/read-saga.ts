import { Diagram, DiagramFormatError, DiagramVersionError, parseDiagram } from '@ariadne/core';

/** Why a saga could not be shown. */
export interface ViewerError {
  /** `network`: the file could not be fetched; `invalid`: not a saga file; `version`: a newer format. */
  kind: 'network' | 'invalid' | 'version';
  /** For people: the reader's message, or what went wrong with the request. */
  message: string;
  /** The file's format version, for `kind: 'version'`. */
  version?: number;
}

export type Loaded = { diagram: Diagram } | { error: ViewerError };

/** Reads YAML text the way the editor does (format version 3 and older). */
export function readSaga(text: string): Loaded {
  try {
    return { diagram: parseDiagram(text) };
  } catch (e) {
    if (e instanceof DiagramVersionError) {
      return {
        error: {
          kind: 'version',
          version: e.version,
          message: `This saga uses format version ${e.version}, which is newer than this viewer reads. Update the viewer.`,
        },
      };
    }
    if (e instanceof DiagramFormatError) return { error: { kind: 'invalid', message: e.message } };
    throw e;
  }
}

/** Fetches `url` and reads it; a failed request is a `network` error. */
export async function fetchSaga(url: string, signal?: AbortSignal): Promise<Loaded> {
  let text: string;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return {
        error: {
          kind: 'network',
          message: `${url} could not be loaded (${`${response.status} ${response.statusText}`.trim()}).`,
        },
      };
    }
    text = await response.text();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return {
      error: { kind: 'network', message: `${url} could not be loaded: ${(e as Error).message}` },
    };
  }
  return readSaga(text);
}
