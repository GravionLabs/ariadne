import { LineCounter, Node, isMap, isSeq, parseDocument } from 'yaml';

/** A range in the source text; line and column are 1-based, like the numbers in an editor. */
export interface SourceRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/** Nesting deeper than this is not read as JSON (the scanner recurses once per level). */
const MAX_JSON_DEPTH = 500;

/** A text is JSON when its first character that is not white space is `{`: a diagram is a mapping. */
export function isJsonText(text: string): boolean {
  return /^﻿?\s*\{/.test(text);
}

interface JsonNode {
  start: number;
  end: number;
  /** For objects: the members in order; for arrays: `value` of each is the item. */
  members?: { key: string; value: JsonNode }[];
  items?: JsonNode[];
  /** Scalars: the decoded string, else `undefined`. */
  text?: string;
}

export interface JsonSyntaxError {
  message: string;
  offset: number;
}

/**
 * Scans JSON text strictly (no trailing commas, no comments), keeping where every value is.
 * Returns the error with its offset when the text is not JSON.
 */
function scanJson(text: string): { root: JsonNode } | { error: JsonSyntaxError } {
  let i = 0;
  const fail = (message: string, offset = i): never => {
    throw { message, offset } satisfies JsonSyntaxError;
  };
  const ws = () => {
    while (i < text.length && ' \t\n\r﻿'.includes(text[i]!)) i++;
  };
  const describe = () => (i >= text.length ? 'end of text' : `"${text[i]}"`);

  const string = (): string => {
    const start = i;
    i++;
    let out = '';
    for (;;) {
      if (i >= text.length) return fail('Unclosed string', start);
      const c = text[i]!;
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\n' || c === '\r') return fail('Unclosed string', start);
      if (c < ' ') return fail('Control character in string');
      if (c === '\\') {
        const n = text[i + 1];
        if (n !== undefined && '"\\/bfnrt'.includes(n)) {
          out += { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[n] ?? n;
          i += 2;
        } else if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
          i += 6;
        } else return fail('Bad escape in string');
      } else {
        out += c;
        i++;
      }
    }
  };

  const value = (depth: number): JsonNode => {
    if (depth > MAX_JSON_DEPTH) return fail('The file is nested too deeply');
    ws();
    const start = i;
    const c = text[i];
    if (c === '{') {
      i++;
      const members: { key: string; value: JsonNode }[] = [];
      ws();
      if (text[i] === '}') {
        i++;
        return { start, end: i, members };
      }
      for (;;) {
        ws();
        if (text[i] !== '"') return fail(`Expected a property name but found ${describe()}`);
        const key = string();
        ws();
        if (text[i] !== ':') return fail(`Expected ":" but found ${describe()}`);
        i++;
        members.push({ key, value: value(depth + 1) });
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return { start, end: i, members };
        }
        return fail(`Expected "," or "}" but found ${describe()}`);
      }
    }
    if (c === '[') {
      i++;
      const items: JsonNode[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return { start, end: i, items };
      }
      for (;;) {
        items.push(value(depth + 1));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return { start, end: i, items };
        }
        return fail(`Expected "," or "]" but found ${describe()}`);
      }
    }
    if (c === '"') {
      const decoded = string();
      return { start, end: i, text: decoded };
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(i, i + 64),
    );
    if (!literal) return fail(`Unexpected ${describe()}`);
    i += literal[0].length;
    return { start, end: i };
  };

  try {
    const root = value(0);
    ws();
    if (i < text.length) fail(`Unexpected ${describe()} after the end of the value`);
    return { root };
  } catch (e) {
    if (e && typeof e === 'object' && 'offset' in e) return { error: e as JsonSyntaxError };
    throw e;
  }
}

/** Offset → 1-based line and column; a line ends at `\n`, `\r\n` or `\r`. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let k = 0; k < text.length; k++) {
    if (text[k] === '\r' && text[k + 1] === '\n') continue;
    if (text[k] === '\n' || text[k] === '\r') starts.push(k + 1);
  }
  return starts;
}

function positionAt(starts: number[], offset: number): { line: number; col: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, col: offset - starts[low]! + 1 };
}

/**
 * The JSON syntax error of a text, if it has one, as the sentence {@link locateSourceError} and
 * `parseDiagram` share: `Not valid JSON: Expected "," … at line 3, column 5`.
 */
export function jsonSyntaxProblem(text: string): { message: string; offset: number } | undefined {
  const scanned = scanJson(text);
  if (!('error' in scanned)) return undefined;
  const { line, col } = positionAt(lineStarts(text), scanned.error.offset);
  return {
    message: `Not valid JSON: ${scanned.error.message} at line ${line}, column ${col}`,
    offset: scanned.error.offset,
  };
}

type Path = (string | number)[];

/** `Duplicate node id "a"`: the path of the id of the second node with it, from the ids in order. */
function duplicatePath(message: string, idsOfNodes: () => (string | undefined)[]): Path | null {
  const id = /^Duplicate node id "(.*)"$/.exec(message)?.[1];
  if (id === undefined) return null;
  const ids = idsOfNodes();
  const first = ids.indexOf(id);
  const second = ids.indexOf(id, first + 1);
  return second < 0 ? null : ['nodes', second, 'id'];
}

/** `nodes[2].activities[0]` → `['nodes', 2, 'activities', 0]`, from the start of a message. */
function pathOf(message: string): Path | null {
  if (message.startsWith('Unsupported format version')) return ['version'];
  const prefix = /^(?:nodes|edges|file)(?:\[\d+\]|\.[A-Za-z_]\w*)*/.exec(message)?.[0];
  if (!prefix || prefix === 'file') return null;
  return [...prefix.matchAll(/([A-Za-z_]\w*)|\[(\d+)\]/g)].map((m) =>
    m[2] !== undefined ? Number(m[2]) : m[1]!,
  );
}

function jsonAt(node: JsonNode, path: Path): JsonNode | undefined {
  let here: JsonNode | undefined = node;
  for (const step of path) {
    if (!here) return undefined;
    here =
      typeof step === 'number'
        ? here.items?.[step]
        : [...(here.members ?? [])].reverse().find((m) => m.key === step)?.value;
  }
  return here;
}

/**
 * Where in the text of a diagram, YAML or JSON (decided by the text), an error of `parseDiagram`
 * points; `null` when it cannot be placed.
 *
 * - Syntax errors carry their position (`Not valid YAML` / `Not valid JSON`).
 * - Format errors start with the path of the offending value (`nodes[2].activities[0] must be …`):
 *   the path is looked up in the document. A value that is missing, a required key for one, is
 *   placed at the closest enclosing value that exists.
 */
export function locateSourceError(text: string, message: string): SourceRange | null {
  return isJsonText(text) ? locateInJson(text, message) : locateInYaml(text, message);
}

function locateInJson(text: string, message: string): SourceRange | null {
  const starts = lineStarts(text);
  const range = (start: number, end: number): SourceRange => {
    const from = positionAt(starts, start);
    const to = positionAt(starts, Math.max(start, end));
    return { line: from.line, column: from.col, endLine: to.line, endColumn: to.col };
  };
  const scanned = scanJson(text);
  if ('error' in scanned) {
    if (!message.startsWith('Not valid JSON')) return null;
    return range(scanned.error.offset, scanned.error.offset + 1);
  }
  const root = scanned.root;
  const path =
    duplicatePath(message, () =>
      (jsonAt(root, ['nodes'])?.items ?? []).map((n) => jsonAt(n, ['id'])?.text),
    ) ?? pathOf(message);
  if (!path) return null;
  for (let length = path.length; length > 0; length--) {
    const node = jsonAt(root, path.slice(0, length));
    if (node) return range(node.start, node.end);
  }
  return null;
}

function locateInYaml(text: string, message: string): SourceRange | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const range = (start: number, end: number): SourceRange => {
    const from = lineCounter.linePos(start);
    const to = lineCounter.linePos(Math.max(start, end));
    return { line: from.line, column: from.col, endLine: to.line, endColumn: to.col };
  };

  if (message.startsWith('Not valid YAML')) {
    const error = doc.errors[0];
    return error ? range(error.pos[0], error.pos[1]) : null;
  }
  if (doc.errors.length > 0) return null;

  const path =
    duplicatePath(message, () => {
      const nodes = doc.get('nodes', true);
      return isSeq(nodes)
        ? nodes.items.map((n) => {
            const id = isMap(n) ? n.get('id') : undefined;
            return typeof id === 'string' ? id : undefined;
          })
        : [];
    }) ?? pathOf(message);
  if (!path) return null;
  for (let length = path.length; length > 0; length--) {
    const node = doc.getIn(path.slice(0, length), true) as Node | null | undefined;
    if (node?.range) return range(node.range[0], node.range[1]);
  }
  return null;
}
