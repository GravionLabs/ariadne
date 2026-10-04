// Bundles the command into one file: `dist/ariadne.mjs`. The packages are TypeScript sources, so
// they are compiled here; @resvg/resvg-js has a native part and stays a dependency.
import { copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/ariadne.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@resvg/resvg-js'],
  legalComments: 'none',
  // Some bundled packages (yaml) are CommonJS and call `require`, which an ES module lacks.
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});

// The C# parser is WebAssembly and is read next to the script when `import` or `diff` run.
const require = createRequire(import.meta.url);
await copyFile(
  require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'),
  'dist/tree-sitter-c_sharp.wasm',
);
await copyFile(
  require.resolve('web-tree-sitter/web-tree-sitter.wasm'),
  'dist/web-tree-sitter.wasm',
);

// The PNG export draws with these fonts (DejaVu Sans Condensed, free to redistribute), read next to
// the script, instead of loading every font of the system.
const fonts = dirname(require.resolve('dejavu-fonts-ttf/package.json'));
for (const font of ['DejaVuSansCondensed.ttf', 'DejaVuSansCondensed-Bold.ttf']) {
  await copyFile(`${fonts}/ttf/${font}`, `dist/${font}`);
}
await copyFile(`${fonts}/LICENSE`, 'dist/DejaVu-LICENSE.txt');
