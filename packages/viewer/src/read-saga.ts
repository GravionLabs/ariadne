import {
  Diagram,
  DiagramFormatError,
  DiagramVersionError,
  locateSourceError,
  parseDiagram,
  validateDiagram,
} from '@ariadne/core';

/** Why a saga could not be shown. */
export interface ViewerError {
  /** `network`: the file could not be fetched; `invalid`: not a saga file; `version`: a newer format. */
  kind: 'network' | 'invalid' | 'version';
  /** For people: the reader's message, or what went wrong with the request. */
  message: string;
  /** The file's format version, for `kind: 'version'`. */
  version?: number;
  /** The HTTP status, for a `network` error of a response (401 and 403 included). */
  status?: number;
  /** For `kind: 'invalid'` of a text (JSON or YAML): where the reader stopped, 1-based. */
  line?: number;
  column?: number;
}

/** How a `src` is requested: fetch's `credentials` mode, request headers, or a fetch of your own. */
export interface FetchOptions {
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  /** Replaces `fetch`, e.g. to add a bearer token; it gets the URL and the init. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

export type Loaded = { diagram: Diagram } | { error: ViewerError };

/** Reads YAML or JSON text (decided by the text) the way the editor does (format version 3 and older). */
export function readSaga(text: string): Loaded {
  return read(() => parseDiagram(text), text);
}

/** Validates a parsed object (e.g. the result of `response.json()`) like {@link readSaga} does text. */
export function readSagaObject(value: unknown): Loaded {
  return read(() => validateDiagram(value));
}

function read(parse: () => Diagram, text?: string): Loaded {
  try {
    return { diagram: parse() };
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
    if (e instanceof DiagramFormatError) {
      const at = text === undefined ? null : locateSourceError(text, e.message);
      return {
        error: {
          kind: 'invalid',
          message: e.message,
          ...(at && { line: at.line, column: at.column }),
        },
      };
    }
    throw e;
  }
}

/** JSON first (ADR 0028), YAML accepted; the content decides, not the type the server answers with. */
const ACCEPT = 'application/json, application/yaml;q=0.9, text/yaml;q=0.9, */*;q=0.5';

/** Fetches `url` and reads it; a failed request is a `network` error. */
export async function fetchSaga(
  url: string,
  signal?: AbortSignal,
  options: FetchOptions = {},
): Promise<Loaded> {
  let text: string;
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('Accept')) headers.set('Accept', ACCEPT);
    const init: RequestInit = { signal, headers };
    if (options.credentials) init.credentials = options.credentials;
    const response = await (options.fetch ?? fetch)(url, init);
    if (!response.ok) {
      return {
        error: {
          kind: 'network',
          status: response.status,
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
