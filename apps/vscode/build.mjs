// Bundles the extension host into `dist/extension.js` (CommonJS, as VS Code loads it) and copies
// the web app's embedded build next to it as `dist/webview`, where the webview reads it.
import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
  // web-tree-sitter reads `import.meta.url`, which a CommonJS bundle does not have.
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
});

const embedded = '../web/dist/embedded';
await rm('dist/webview', { recursive: true, force: true });
if (existsSync(embedded)) {
  await mkdir('dist/webview', { recursive: true });
  await cp(embedded, 'dist/webview', { recursive: true });
} else {
  console.warn(`No embedded editor at ${embedded}; the webview shows a placeholder.`);
}

// The C# parser is WebAssembly (tree-sitter), read next to the bundle when a class is imported.
const require = createRequire(import.meta.url);
await copyFile(
  require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'),
  'dist/tree-sitter-c_sharp.wasm',
);
await copyFile(
  require.resolve('web-tree-sitter/web-tree-sitter.wasm'),
  'dist/web-tree-sitter.wasm',
);

// The JSON Schema of `*.saga.yaml`, contributed as `yamlValidation` (Red Hat YAML extension).
await copyFile('../../docs/specs/saga.schema.json', 'dist/saga.schema.json');
