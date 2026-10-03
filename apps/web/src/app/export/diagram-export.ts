import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';
import { PngOptions, svgToPng } from './diagram-png';
import {
  diagramToMarkdown,
  diagramToMermaid,
  mermaidMarkdown,
  renderDiagramSvg,
} from '@ariadne/export';

/** Name of an export of `diagramName`: `order.saga.yaml` becomes `order.svg`. */
export function exportFileName(
  diagramName: string,
  extension: 'svg' | 'png' | 'mmd' | 'md' | 'docs.md',
): string {
  const base = diagramName.replace(/\.(saga\.)?ya?ml$/i, '') || 'diagram';
  return `${base}.${extension}`;
}

/** Exports the diagram as an image through {@link FileStorage}. */
@Injectable({ providedIn: 'root' })
export class DiagramExport {
  private readonly store = inject(DiagramStore);
  private readonly document = inject(DiagramDocument);
  private readonly storage = inject(FileStorage);
  private readonly window = inject(DOCUMENT).defaultView;

  /** Returns false if the user cancelled or the export failed (the error is shown). */
  exportSvg(): Promise<boolean> {
    return this.run('svg', async () => {
      const { svg } = renderDiagramSvg(this.store.diagram());
      return new Blob([svg], { type: 'image/svg+xml' });
    });
  }

  exportPng(options?: PngOptions): Promise<boolean> {
    return this.run('png', async () => {
      const { svg, width, height } = renderDiagramSvg(this.store.diagram());
      return svgToPng(svg, { width, height }, options);
    });
  }

  /** Saves the Mermaid text as `.mmd`, or in a fenced block as `.md`. */
  exportMermaid(extension: 'mmd' | 'md'): Promise<boolean> {
    return this.run(extension, async () => {
      const mermaid = diagramToMermaid(this.store.diagram());
      return extension === 'md'
        ? new Blob([mermaidMarkdown(mermaid)], { type: 'text/markdown' })
        : new Blob([mermaid], { type: 'text/plain' });
    });
  }

  /** Saves a Markdown page documenting the saga, titled with the file name. */
  exportMarkdown(): Promise<boolean> {
    return this.run('docs.md', async () => {
      const title = exportFileName(this.document.name(), 'docs.md').replace(/\.docs\.md$/, '');
      const markdown = diagramToMarkdown(this.store.diagram(), { title });
      return new Blob([markdown], { type: 'text/markdown' });
    });
  }

  async copyMermaid(): Promise<boolean> {
    try {
      const clipboard = this.window?.navigator.clipboard;
      if (!clipboard) throw new Error('The clipboard is not available in this browser.');
      await clipboard.writeText(diagramToMermaid(this.store.diagram()));
      this.document.setError(null);
      this.document.setNotice('Mermaid copied to clipboard.');
      return true;
    } catch (e) {
      this.document.setError((e as Error).message);
      return false;
    }
  }

  private async run(
    extension: 'svg' | 'png' | 'mmd' | 'md' | 'docs.md',
    render: () => Promise<Blob>,
  ): Promise<boolean> {
    try {
      const blob = await render();
      const ref = await this.storage.exportFile(
        blob,
        exportFileName(this.document.name(), extension),
      );
      if (ref) this.document.setError(null);
      return !!ref;
    } catch (e) {
      this.document.setError((e as Error).message);
      return false;
    }
  }
}
