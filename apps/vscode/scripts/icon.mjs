// Draws `icon.png` (the extension's icon, 256 × 256) from the favicon of the web app.
//
//   pnpm --filter ariadne-vscode icon
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Resvg, initWasm } from '@resvg/resvg-wasm';

const require = createRequire(import.meta.url);
await initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
const svg = await readFile(new URL('../../web/public/favicon.svg', import.meta.url), 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
await writeFile(new URL('../icon.png', import.meta.url), png);
console.log(`icon.png: ${png.length} bytes`);
