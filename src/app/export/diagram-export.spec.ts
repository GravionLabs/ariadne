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
    expect(exportFileName('order.saga.yaml', 'mmd')).toBe('order.mmd');
    expect(exportFileName('order.saga.yaml', 'docs.md')).toBe('order.docs.md');
  });
});

/** jsdom has no clipboard; defined per test and removed again. */
function stubClipboard(clipboard: { writeText: (text: string) => Promise<void> }): void {
  Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
}

describe('DiagramExport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.navigator, 'clipboard');
  });

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

  it('saves Mermaid as .mmd, or fenced as .md', async () => {
    expect(await exporter.exportMermaid('mmd')).toBe(true);
    const [mmd, mmdName] = exportFile.mock.calls[0];
    expect(mmdName).toBe('untitled.mmd');
    expect(await mmd.text()).toMatch(/^stateDiagram-v2\n/);

    await exporter.exportMermaid('md');
    const [md, mdName] = exportFile.mock.calls[1];
    expect(mdName).toBe('untitled.md');
    expect((await md.text()).startsWith('```mermaid\nstateDiagram-v2\n')).toBe(true);
  });

  it('saves the documentation page, titled with the diagram name', async () => {
    expect(await exporter.exportMarkdown()).toBe(true);
    const [blob, name] = exportFile.mock.calls[0];
    expect(name).toBe('untitled.docs.md');
    expect(await blob.text()).toMatch(/^# untitled\n/);
  });

  it('copies Mermaid to the clipboard and says so', async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard({ writeText });
    expect(await exporter.copyMermaid()).toBe(true);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^stateDiagram-v2\n/));
    expect(doc.notice()).toBe('Mermaid copied to clipboard.');
  });

  it('shows an error when the clipboard refuses', async () => {
    stubClipboard({
      writeText: vi.fn(async () => {
        throw new Error('denied');
      }),
    });
    expect(await exporter.copyMermaid()).toBe(false);
    expect(doc.error()).toBe('denied');
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
