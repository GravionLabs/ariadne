import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import type { Rasterise } from './export-formats';

// A rasteriser in WebAssembly: no native part, so one extension runs on every platform. It has no
// system fonts to read, so the build copies a font next to the bundle (DejaVu Sans Condensed, free
// to redistribute).
export const FONT_FILES = ['DejaVuSansCondensed.ttf', 'DejaVuSansCondensed-Bold.ttf'];
const FAMILY = 'DejaVu Sans Condensed';

export interface PngAssets {
  wasm: Uint8Array;
  fonts: Uint8Array[];
}

/** The WebAssembly can be initialised once per process, whoever asks first. */
let wasmReady: Promise<void> | undefined;

/** The rasteriser, loading its WebAssembly and fonts on first use. A failed start is retried. */
export function createRasteriser(load: () => Promise<PngAssets>): Rasterise {
  let ready: Promise<Uint8Array[]> | undefined;
  const start = (): Promise<Uint8Array[]> =>
    (ready ??= (async () => {
      const { wasm, fonts } = await load();
      wasmReady ??= initWasm(wasm);
      await wasmReady;
      return fonts;
    })().catch((e) => {
      ready = undefined;
      wasmReady = undefined;
      throw e;
    }));

  return async (svg) => {
    const fontBuffers = await start();
    // The SVG at 2× on white, like the PNG export of the editor.
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: 2 },
      background: '#ffffff',
      font: {
        fontBuffers,
        loadSystemFonts: false,
        defaultFontFamily: FAMILY,
        sansSerifFamily: FAMILY,
      },
    });
    try {
      return resvg.render().asPng();
    } finally {
      resvg.free();
    }
  };
}

/** The assets the build copies next to the bundle (`__dirname`). */
export const svgToPng: Rasterise = createRasteriser(async () => ({
  wasm: await readFile(path.join(__dirname, 'resvg.wasm')),
  fonts: await Promise.all(
    FONT_FILES.map(async (f) => new Uint8Array(await readFile(path.join(__dirname, f)))),
  ),
}));
