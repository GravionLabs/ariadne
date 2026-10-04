import * as path from 'node:path';
import type { Diagram } from '@ariadne/core';
import { diagramToMarkdown, diagramToMermaid, renderDiagramSvg } from '@ariadne/export';

export type ExportFormat = 'mermaid' | 'svg' | 'png' | 'markdown';

/** Turns SVG into a PNG; `png.ts` does it in the extension, tests give their own. */
export type Rasterise = (svg: string) => Promise<Uint8Array>;

export interface Exported {
  content: string | Uint8Array;
  /** File extension with the dot. */
  extension: string;
}

const EXTENSIONS: Record<ExportFormat, string> = {
  mermaid: '.mmd',
  svg: '.svg',
  png: '.png',
  markdown: '.md',
};

/** `dir/order.saga.yaml` → `order`. */
export function baseName(file: string): string {
  return path.basename(file).replace(/\.(saga\.)?ya?ml$/i, '') || 'saga';
}

/** The file an export is saved to: `order.saga.yaml` → `order.svg`, in `folder`. */
export function exportPath(diagramFile: string, format: ExportFormat, folder: string): string {
  return path.join(folder, `${baseName(diagramFile)}${EXTENSIONS[format]}`);
}

/** The diagram in the format; Markdown is the documentation page, titled by the diagram's name. */
export async function renderExport(
  diagram: Diagram,
  format: ExportFormat,
  diagramFile: string,
  rasterise: Rasterise,
): Promise<Exported> {
  const extension = EXTENSIONS[format];
  switch (format) {
    case 'mermaid':
      return { content: diagramToMermaid(diagram), extension };
    case 'markdown':
      return {
        content: diagramToMarkdown(diagram, { title: diagram.name ?? baseName(diagramFile) }),
        extension,
      };
    case 'svg':
      return { content: renderDiagramSvg(diagram).svg, extension };
    case 'png':
      return { content: await rasterise(renderDiagramSvg(diagram).svg), extension };
  }
}
