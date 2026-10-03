// Bundles the extension host into `dist/extension.js` (CommonJS, as VS Code loads it) and copies
// the web app's embedded build next to it as `dist/webview`, where the webview reads it.
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
  legalComments: 'none',
  sourcemap: true,
});

const embedded = '../web/dist/embedded/browser';
await rm('dist/webview', { recursive: true, force: true });
if (existsSync(embedded)) {
  await mkdir('dist/webview', { recursive: true });
  await cp(embedded, 'dist/webview', { recursive: true });
} else {
  console.warn(`No embedded editor at ${embedded}; the webview shows a placeholder.`);
}
