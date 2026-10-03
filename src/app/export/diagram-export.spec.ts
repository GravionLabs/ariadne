import { TestBed } from '@angular/core/testing';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';
import { DiagramExport, exportFileName } from './diagram-export';

describe('exportFileName', () => {
  it('swaps the diagram extension for the image one', () => {
    expect(exportFileName('order.saga.yaml', 'svg')).toBe('order.svg');
    expect(exportFileName('order.yml', 'png')).toBe('order.png');
    expect(exportFileName('order', 'png')).toBe('order.png');
    expect(exportFileName('.saga.yaml', 'svg')).toBe('diagram.svg');
  });
});

describe('DiagramExport', () => {
  const exportFile = vi.fn();
  let exporter: DiagramExport;
  let doc: DiagramDocument;

  beforeEach(() => {
    exportFile.mockReset().mockImplementation(async (_b: Blob, name: string) => ({ name }));
    TestBed.configureTestingModule({
      providers: [{ provide: FileStorage, useValue: { exportFile } }],
    });
    TestBed.inject(DiagramStore);
    doc = TestBed.inject(DiagramDocument);
    exporter = TestBed.inject(DiagramExport);
  });

  it('saves the SVG through FileStorage', async () => {
    expect(await exporter.exportSvg()).toBe(true);
    const [blob, name] = exportFile.mock.calls[0];
    expect(name).toBe('untitled.svg');
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toContain('<svg');
  });

  it('reports false without an error when the user cancels', async () => {
    exportFile.mockResolvedValue(null);
    expect(await exporter.exportSvg()).toBe(false);
    expect(doc.error()).toBeNull();
  });

  it('shows the error when saving fails', async () => {
    exportFile.mockRejectedValue(new Error('disk full'));
    expect(await exporter.exportSvg()).toBe(false);
    expect(doc.error()).toBe('disk full');
  });
});
