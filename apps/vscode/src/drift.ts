import { DiagramFormatError, parseDiagram, type Diagram } from '@ariadne/core';
import { diffDiagrams, type Difference } from '@ariadne/masstransit/diff';
import { importFromCsharp, type ImportedDiagram } from './import-saga';
import { importSagas, type CSharpParser, type ImportedSaga } from '@ariadne/masstransit';

export type DriftResult =
  /** The diagram has no `saga.source`, or it cannot be read: nothing to compare. */
  | { kind: 'skipped'; reason: string }
  /** The two cannot be compared; said on the diagram. */
  | { kind: 'problem'; message: string }
  | { kind: 'compared'; differences: Difference[]; code: ImportedSaga; diagram: Diagram };

/**
 * Compares a diagram with the C# it names in `saga.source`: the state machine of the diagram's class
 * (`saga.class`), or the only one in the file. Differences are the ones of `diffDiagrams`.
 */
export function compareWithCode(
  diagramText: string,
  csharpPath: string,
  csharpText: string,
  parser: CSharpParser,
): DriftResult {
  let diagram: Diagram;
  try {
    diagram = parseDiagram(diagramText);
  } catch (e) {
    const detail = e instanceof DiagramFormatError ? e.message : (e as Error).message;
    return { kind: 'skipped', reason: `The diagram cannot be read: ${detail}` };
  }
  if (!diagram.saga?.source) return { kind: 'skipped', reason: 'The diagram names no C# file.' };

  const { sagas } = importSagas([{ path: csharpPath, content: csharpText }], parser);
  const wanted = diagram.saga.className;
  const found = wanted
    ? sagas.find((s) => s.className === wanted)
    : sagas.length === 1
      ? sagas[0]
      : undefined;
  if (!found) {
    const have = sagas.map((s) => s.className).join(', ') || 'none';
    return {
      kind: 'problem',
      message: wanted
        ? `The state machine ${wanted} is not in ${diagram.saga.source} (found: ${have}).`
        : `Which state machine? ${diagram.saga.source} has: ${have}. Name it in saga.class.`,
    };
  }
  return {
    kind: 'compared',
    differences: diffDiagrams(diagram, found.diagram),
    code: found,
    diagram,
  };
}

/** Zero-based line of `key:` inside the `saga:` block of a diagram file; 0 when it is not there. */
export function sagaLine(diagramText: string, key: 'source' | 'class'): number {
  const lines = diagramText.split('\n');
  const start = lines.findIndex((l) => /^saga:\s*$/.test(l));
  if (start < 0) return 0;
  for (let i = start + 1; i < lines.length; i++) {
    if (!/^\s/.test(lines[i]!)) break;
    if (new RegExp(`^\\s+${key}:`).test(lines[i]!)) return i;
  }
  return start;
}

/**
 * The diagram the code says it should be, for "Update diagram from code": the state machine of the
 * diagram's class, or the only one in the file. `diagramDir` is where the diagram lives, so
 * `saga.source` stays right.
 */
export function diagramFromCode(
  diagramText: string,
  diagramDir: string,
  csharpPath: string,
  csharpText: string,
  parser: CSharpParser,
): ImportedDiagram | undefined {
  let wanted: string | undefined;
  try {
    wanted = parseDiagram(diagramText).saga?.className;
  } catch {
    // An unreadable diagram has no class to look for; the file's only state machine is taken.
  }
  const { diagrams } = importFromCsharp(csharpPath, csharpText, diagramDir, parser);
  return wanted
    ? diagrams.find((d) => d.className === wanted)
    : diagrams.length === 1
      ? diagrams[0]
      : undefined;
}
