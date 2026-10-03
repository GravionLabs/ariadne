import { serializeDiagram, type Diagram } from '@ariadne/core';
import {
  importSagas,
  type CSharpParser,
  type ImportWarning,
  type SourceLocation,
} from '@ariadne/masstransit';
import { relativePosix } from './paths';

/** A diagram read from the code of a state machine, ready to be written. */
export interface ImportedDiagram {
  className: string;
  /** `OrderStateMachine.saga.yaml` */
  fileName: string;
  /** The file's text; the diagram names its C# file in `saga.source`. */
  text: string;
  diagram: Diagram;
  locations: {
    states: Record<string, SourceLocation>;
    transitions: Record<string, SourceLocation>;
  };
}

export interface ImportOutcome {
  diagrams: ImportedDiagram[];
  warnings: ImportWarning[];
}

/**
 * The state machines in one C# file as diagrams. `diagramDir` is the folder they will be written to;
 * it decides how `saga.source` names the C# file. A partial class is read from the given file only,
 * which the importer says in a warning.
 */
export function importFromCsharp(
  csharpPath: string,
  content: string,
  diagramDir: string,
  parser: CSharpParser,
): ImportOutcome {
  const { sagas, warnings } = importSagas([{ path: csharpPath, content }], parser);
  const source = relativePosix(diagramDir, csharpPath);
  return {
    warnings,
    diagrams: sagas.map((saga) => {
      const diagram: Diagram = { ...saga.diagram, saga: { ...saga.diagram.saga, source } };
      return {
        className: saga.className,
        fileName: `${saga.className}.saga.yaml`,
        text: serializeDiagram(diagram),
        diagram,
        locations: saga.locations,
      };
    }),
  };
}

/** What to do with an imported diagram, given the file it would be written to. */
export type ImportDecision = 'create' | 'unchanged' | 'confirm';

export function decideImport(existing: string | undefined, imported: string): ImportDecision {
  if (existing === undefined) return 'create';
  return existing === imported ? 'unchanged' : 'confirm';
}
