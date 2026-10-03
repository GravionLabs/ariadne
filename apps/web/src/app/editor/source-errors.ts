import { LineCounter, Node, ParsedNode, YAMLMap, YAMLSeq, isMap, isSeq, parseDocument } from 'yaml';

/** A position in the source text, 1-based like the line numbers in the editor. */
export interface SourcePosition {
  line: number;
  column: number;
}

/**
 * Where in the YAML text an error from `parseDiagram` points, or `null` if it cannot be placed.
 *
 * - YAML syntax errors carry their position.
 * - Format errors start with the path of the offending value (`nodes[2].activities[0] must be …`):
 *   the path is looked up in the parsed document. A value that is missing is placed at the
 *   closest enclosing value that exists.
 */
export function locateSourceError(text: string, message: string): SourcePosition | null {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });

  if (message.startsWith('Not valid YAML')) {
    const pos = doc.errors[0]?.linePos?.[0];
    return pos ? { line: pos.line, column: pos.col } : null;
  }
  if (doc.errors.length > 0) return null;

  const path = duplicateNodePath(doc.contents, message) ?? pathOf(message);
  if (!path) return null;
  for (let length = path.length; length > 0; length--) {
    const node = doc.getIn(path.slice(0, length), true) as Node | null | undefined;
    const start = node?.range?.[0];
    if (start !== undefined) return toPosition(lineCounter, start);
  }
  return null;
}

function toPosition(lineCounter: LineCounter, offset: number): SourcePosition {
  const { line, col } = lineCounter.linePos(offset);
  return { line, column: col };
}

/** `nodes[2].activities[0]` → `['nodes', 2, 'activities', 0]`, from the start of a message. */
function pathOf(message: string): (string | number)[] | null {
  if (message.startsWith('Unsupported format version')) return ['version'];
  const prefix = /^(?:nodes|edges|direction|file)(?:\[\d+\]|\.[A-Za-z_]\w*)*/.exec(message)?.[0];
  if (!prefix || prefix === 'file') return null;
  return [...prefix.matchAll(/([A-Za-z_]\w*)|\[(\d+)\]/g)].map((m) =>
    m[2] !== undefined ? Number(m[2]) : m[1],
  );
}

/** `Duplicate node id "a"`: the second node with that id. */
function duplicateNodePath(
  contents: ParsedNode | null,
  message: string,
): (string | number)[] | null {
  const id = /^Duplicate node id "(.*)"$/.exec(message)?.[1];
  if (id === undefined || !isMap(contents)) return null;
  const nodes = (contents as YAMLMap).get('nodes', true);
  if (!isSeq(nodes)) return null;
  const items = (nodes as YAMLSeq).items;
  const second = items.findIndex(
    (item, i) =>
      isMap(item) &&
      (item as YAMLMap).get('id') === id &&
      items.findIndex((other) => isMap(other) && (other as YAMLMap).get('id') === id) < i,
  );
  return second < 0 ? null : ['nodes', second, 'id'];
}
