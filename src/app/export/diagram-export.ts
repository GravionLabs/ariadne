import { Injectable, inject } from '@angular/core';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';
import { PngOptions, svgToPng } from './diagram-png';
import { renderDiagramSvg } from './diagram-svg';

/** Name of an export of `diagramName`: `order.saga.yaml` becomes `order.svg`. */
export function exportFileName(diagramName: string, extension: 'svg' | 'png'): string {
  const base = diagramName.replace(/\.(saga\.)?ya?ml$/i, '') || 'diagram';
  return `${base}.${extension}`;
}

/** Exports the diagram as an image through {@link FileStorage}. */
@Injectable({ providedIn: 'root' })
export class DiagramExport {
  private readonly store = inject(DiagramStore);
  private readonly document = inject(DiagramDocument);
  private readonly storage = inject(FileStorage);

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

  private async run(extension: 'svg' | 'png', render: () => Promise<Blob>): Promise<boolean> {
    try {
      const blob = await render();
      const ref = await this.storage.exportFile(
        blob,
        exportFileName(this.document.name(), extension),
      );
      if (ref) this.document.error.set(null);
      return !!ref;
    } catch (e) {
      this.document.error.set((e as Error).message);
      return false;
    }
  }
}
