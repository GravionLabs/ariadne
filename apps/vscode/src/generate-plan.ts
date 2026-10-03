import * as path from 'node:path';
import type { Diagram } from '@ariadne/core';
import { generateSaga } from '@ariadne/masstransit/generate';
import { resolveSource } from './paths';

export interface GenerateSettings {
  /** `ariadne.generate.folder`, relative to the workspace folder; empty for none. */
  folder: string;
  /** `ariadne.generate.namespace`; empty for none. */
  namespace: string;
}

export type FileStatus = 'new' | 'changed' | 'unchanged';

export interface PlannedFile {
  /** Absolute path the file is written to. */
  path: string;
  content: string;
  status: FileStatus;
}

export interface GeneratePlan {
  files: PlannedFile[];
  warnings: string[];
}

/**
 * Where generated C# goes: the folder setting (below the workspace folder), else the folder of the
 * C# file the diagram names in `saga.source`, else the folder of the diagram itself.
 */
export function targetFolder(
  diagram: Diagram,
  diagramFile: string,
  settings: GenerateSettings,
  workspaceFolder: string | undefined,
): string {
  const folder = settings.folder.trim();
  if (folder && workspaceFolder) return path.join(workspaceFolder, ...folder.split(/[\\/]+/));
  const diagramDir = path.dirname(diagramFile);
  const source = diagram.saga?.source;
  return source ? path.dirname(resolveSource(diagramDir, source)) : diagramDir;
}

/**
 * The C# files for a diagram and what each would do to the disk. The namespace of the diagram wins
 * over the setting. `read` returns the text of an existing file.
 */
export function planGeneration(
  diagram: Diagram,
  diagramFile: string,
  settings: GenerateSettings,
  workspaceFolder: string | undefined,
  read: (file: string) => string | undefined,
): GeneratePlan {
  const namespace = settings.namespace.trim();
  const withNamespace =
    namespace && !diagram.saga?.namespace
      ? { ...diagram, saga: { ...diagram.saga, namespace } }
      : diagram;
  const { files, warnings } = generateSaga(withNamespace);
  const folder = targetFolder(diagram, diagramFile, settings, workspaceFolder);
  return {
    warnings,
    files: files.map((file) => {
      const target = path.join(folder, ...file.path.split('/'));
      const existing = read(target);
      return {
        path: target,
        content: file.content,
        status:
          existing === undefined ? 'new' : existing === file.content ? 'unchanged' : 'changed',
      };
    }),
  };
}
