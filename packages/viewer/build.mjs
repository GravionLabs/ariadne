// Bundles the element for plain HTML pages: `dist/ariadne-viewer.js` registers `<ariadne-saga>` when
// loaded. The demo page and a sample saga go to `dist/demo/`; serve `dist/` with any static server
// (the page fetches the saga, which `file://` does not allow).
import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/define.ts'],
  outfile: 'dist/ariadne-viewer.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
});

await mkdir('dist/demo', { recursive: true });
await copyFile('demo/index.html', 'dist/demo/index.html');
await copyFile(
  '../../samples/sagas/order/OrderStateMachine.saga.yaml',
  'dist/demo/order.saga.yaml',
);
