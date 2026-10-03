// Bundles the command into one file: `dist/ariadne.mjs`. The packages are TypeScript sources, so
// they are compiled here; @resvg/resvg-js has a native part and stays a dependency.
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
