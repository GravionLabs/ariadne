import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { parseDiagram } from '@ariadne/core';
import { baseName, exportPath, renderExport } from './export-formats';
import { FONT_FILES, createRasteriser } from './png';

const require = createRequire(import.meta.url);
const diagram = parseDiagram(`version: 3
name: Order Saga
direction: top-bottom
nodes:
  - id: a
    type: start
    name: Initial
  - id: b
    type: state
    name: Submitted
  - id: c
    type: end
    name: Completed
edges:
  - id: e1
    source: a
    target: b
    kind: forward
    event: OrderSubmitted
    eventSource: Shop
  - id: e2
    source: b
    target: c
    kind: forward
    event: OrderShipped
    eventSource: Shop
`);

// The rasteriser from the packages themselves, so the spec does not need a build.
const fonts = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const rasterise = createRasteriser(async () => ({
  wasm: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
  fonts: FONT_FILES.map((f) => new Uint8Array(readFileSync(path.join(fonts, f)))),
}));

describe('exportPath', () => {
  it('names the file after the diagram, with the extension of the format', () => {
    const dir = path.resolve('/out');
    const file = path.resolve('/w/order.saga.yaml');
    expect(exportPath(file, 'svg', dir)).toBe(path.join(dir, 'order.svg'));
    expect(exportPath(file, 'png', dir)).toBe(path.join(dir, 'order.png'));
    expect(exportPath(file, 'mermaid', dir)).toBe(path.join(dir, 'order.mmd'));
    expect(exportPath(file, 'markdown', dir)).toBe(path.join(dir, 'order.md'));
  });

  it('knows plain yaml names too, and a name that is nothing but the extension', () => {
    expect(baseName('/w/old.yaml')).toBe('old');
    expect(baseName('/w/other.yml')).toBe('other');
    expect(baseName('/w/.saga.yaml')).toBe('saga');
  });
});

describe('renderExport', () => {
  it('writes Mermaid text', async () => {
    const out = await renderExport(diagram, 'mermaid', '/w/order.saga.yaml', rasterise);
    expect(out.extension).toBe('.mmd');
    expect(out.content).toMatch(/stateDiagram-v2/);
    expect(out.content).toContain('OrderSubmitted');
  });

  it('writes the documentation page, titled by the diagram', async () => {
    const out = await renderExport(diagram, 'markdown', '/w/order.saga.yaml', rasterise);
    expect(out.content).toMatch(/^# Order Saga/);
  });

  it('titles the page by the file when the diagram has no name', async () => {
    const unnamed = { ...diagram, name: undefined };
    const out = await renderExport(unnamed, 'markdown', '/w/order.saga.yaml', rasterise);
    expect(out.content).toMatch(/^# order/i);
  });

  it('writes an SVG', async () => {
    const out = await renderExport(diagram, 'svg', '/w/order.saga.yaml', rasterise);
    expect(out.content).toMatch(/^<svg /);
    expect(out.content).toContain('Submitted');
  });

  it('writes a PNG: a real image at twice the size', async () => {
    const out = await renderExport(diagram, 'png', '/w/order.saga.yaml', rasterise);
    const bytes = out.content as Uint8Array;
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svg = (await renderExport(diagram, 'svg', '/w/order.saga.yaml', rasterise))
      .content as string;
    const width = Number(/<svg [^>]*width="(\d+)"/.exec(svg)![1]);
    const png = new DataView(bytes.buffer, bytes.byteOffset);
    expect(png.getUint32(16)).toBe(width * 2);
  });

  it('draws the text: a PNG with fonts differs from one without', async () => {
    const withFonts = (await renderExport(diagram, 'png', '/w/o.saga.yaml', rasterise))
      .content as Uint8Array;
    const withoutFonts = await createRasteriser(async () => ({
      wasm: readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
      fonts: [],
    }))((await renderExport(diagram, 'svg', '/w/o.saga.yaml', rasterise)).content as string);
    expect(withFonts.length).toBeGreaterThan(withoutFonts.length);
  });
});
