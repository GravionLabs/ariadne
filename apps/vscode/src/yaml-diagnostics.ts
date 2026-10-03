import {
  DiagramFormatError,
  parseDiagramWithNotes,
  validate,
  type Diagram,
  type Finding,
} from '@ariadne/core';
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Document, type Node } from 'yaml';

export type ProblemSeverity = 'error' | 'warning' | 'info';

/** Zero-based, like VS Code's ranges. */
export interface ProblemRange {
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}

export interface Problem {
  severity: ProblemSeverity;
  message: string;
  /** The rule of a finding (`dead-end`, …); absent for errors of the file. */
  code?: string;
  range: ProblemRange;
}

/**
 * Everything wrong with the text of a `*.saga.yaml`, with where it is: YAML syntax errors, what the
 * reader rejects (`parseDiagram`), and the findings of `validate`. Pure; the same rules as the editor.
 */
export function checkDiagramText(text: string): Problem[] {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  const at = (start: number, end: number): ProblemRange => {
    const from = lines.linePos(start);
    const to = lines.linePos(Math.max(start, end));
    return {
      line: from.line - 1,
      character: from.col - 1,
      endLine: to.line - 1,
      endCharacter: to.col - 1,
    };
  };
  const whole = (): ProblemRange => {
    const first = text.split('\n')[0] ?? '';
    return { line: 0, character: 0, endLine: 0, endCharacter: first.length };
  };
  const rangeOf = (node: Node | null | undefined): ProblemRange =>
    node?.range ? at(node.range[0], node.range[1]) : whole();

  if (doc.errors.length > 0) {
    return doc.errors.map((e) => ({
      severity: 'error',
      message: `Not valid YAML: ${e.message.split('\n')[0]}`,
      range: at(e.pos[0], e.pos[1]),
    }));
  }

  let diagram: Diagram;
  const problems: Problem[] = [];
  try {
    const parsed = parseDiagramWithNotes(text);
    diagram = parsed.diagram;
    for (const note of parsed.notes) {
      problems.push({
        severity: 'info',
        message: note,
        range: rangeOf(doc.get('version', true) as Node),
      });
    }
  } catch (e) {
    if (!(e instanceof DiagramFormatError)) throw e;
    return [
      { severity: 'error', message: e.message, range: errorRange(doc, e.message, rangeOf, whole) },
    ];
  }

  for (const finding of validate(diagram)) {
    problems.push({
      severity: finding.severity,
      message: finding.message,
      code: finding.code,
      range: findingRange(doc, finding, rangeOf, whole),
    });
  }
  return problems;
}

type RangeOf = (node: Node | null | undefined) => ProblemRange;

/** `nodes[2].type must be …` → `['nodes', 2, 'type']`; undefined when the message has no path. */
function pathOf(message: string): (string | number)[] | undefined {
  const match = /^([A-Za-z]+(?:\[\d+\])?(?:\.[A-Za-z]+(?:\[\d+\])?)*)/.exec(message);
  if (!match) return undefined;
  return [...match[1]!.matchAll(/([A-Za-z]+)|\[(\d+)\]/g)].map((m) =>
    m[1] !== undefined ? m[1] : Number(m[2]),
  );
}

/** The place of an error of the reader: by the path in its message, else by what it says. */
function errorRange(
  doc: Document.Parsed,
  message: string,
  rangeOf: RangeOf,
  whole: () => ProblemRange,
): ProblemRange {
  const nodesOf = (): Node[] => {
    const seq = doc.get('nodes', true);
    return isSeq(seq) ? (seq.items as Node[]) : [];
  };
  const field = (item: Node, key: string): Node | undefined =>
    isMap(item) ? (item.get(key, true) as Node | undefined) : undefined;

  const duplicate = /^Duplicate node id "(.+)"$/.exec(message);
  if (duplicate) {
    const same = nodesOf().filter((n) => {
      const id = field(n, 'id');
      return isScalar(id) && id.value === duplicate[1];
    });
    return rangeOf(field(same[1] ?? same[0]!, 'id'));
  }
  if (message.startsWith('There can be only one node of type "any"')) {
    const anys = nodesOf().filter((n) => {
      const type = field(n, 'type');
      return isScalar(type) && type.value === 'any';
    });
    return rangeOf(field(anys[1] ?? anys[0]!, 'type'));
  }
  if (message.startsWith('Unsupported format version'))
    return rangeOf(doc.get('version', true) as Node);
  if (message.startsWith('Not valid YAML')) return whole();

  const path = pathOf(message);
  if (path) {
    // The deepest place that exists: a missing field is reported on the item that lacks it.
    for (let length = path.length; length > 0; length--) {
      const node = doc.getIn(path.slice(0, length), true) as Node | undefined;
      if (node?.range) return rangeOf(node);
    }
  }
  return whole();
}

/** The place of a finding: the name of its state, the event (else the id) of its transition. */
function findingRange(
  doc: Document.Parsed,
  finding: Finding,
  rangeOf: RangeOf,
  whole: () => ProblemRange,
): ProblemRange {
  if (!finding.elementId) {
    // The key `nodes:`, not the list below it.
    const pair = isMap(doc.contents)
      ? doc.contents.items.find((p) => isScalar(p.key) && p.key.value === 'nodes')
      : undefined;
    return pair && isScalar(pair.key) ? rangeOf(pair.key as Node) : whole();
  }
  for (const [list, preferred] of [
    ['nodes', 'name'],
    ['edges', 'event'],
  ] as const) {
    const seq = doc.get(list, true);
    if (!isSeq(seq)) continue;
    for (const item of seq.items) {
      if (!isMap(item) || item.get('id') !== finding.elementId) continue;
      return rangeOf(
        ((item.get(preferred, true) ?? item.get('id', true)) as Node | undefined) ?? (item as Node),
      );
    }
  }
  return whole();
}
