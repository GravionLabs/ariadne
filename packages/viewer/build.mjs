// Builds what is published and what the demo page needs:
//
//   dist/index.js          the element as an ES module (`@ariadne/viewer`); core and export are bundled in
//   dist/index.d.ts        its types, bundled the same way
//   dist/ariadne-viewer.js one file for plain HTML pages: loading it registers <ariadne-saga>
//   dist/angular/          the Angular wrapper (`@ariadne/viewer/angular`), compiled in partial mode
//   dist/demo/             the demo page and a sample saga (serve `dist/` with any static server)
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';

await rm('dist', { recursive: true, force: true });

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  legalComments: 'none',
};
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({
  ...common,
  entryPoints: ['src/define.ts'],
  outfile: 'dist/ariadne-viewer.js',
  minify: true,
});

// The declarations of the workspace packages the API mentions (Diagram, PathStep, ...) go in.
const bundle = await rollup({
  input: 'src/index.ts',
  plugins: [dts({ tsconfig: 'tsconfig.json', respectExternal: true })],
});
await bundle.write({ file: 'dist/index.d.ts', format: 'es' });
await bundle.close();

// The wrapper imports `@ariadne/viewer` and finds it in the declarations above; it stays an import.
execFileSync('pnpm', ['exec', 'ngc', '-p', 'angular/tsconfig.build.json'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// ngc writes one file per source file with extensionless imports; Node's ES module loader and
// TypeScript's node16 resolution need single files (or extensions), so each is bundled into one.
const external = [/^@angular\//, /^@ariadne\//, /^rxjs/];
const wrapperJs = await build({
  entryPoints: ['dist/angular/index.js'],
  bundle: true,
  format: 'esm',
  packages: 'external',
  charset: 'utf8',
  // Not through the workspace's `paths`: the wrapper imports the published entry.
  external: ['@ariadne/viewer'],
  target: 'es2022',
  legalComments: 'none',
  write: false,
});
const wrapperTypes = await rollup({
  input: 'dist/angular/index.d.ts',
  external,
  plugins: [dts()],
});
const { output: typeOutput } = await wrapperTypes.generate({ format: 'es' });
await wrapperTypes.close();
for (const file of await readdir('dist/angular')) await rm(`dist/angular/${file}`);
await writeFile('dist/angular/index.js', wrapperJs.outputFiles[0].text);
await writeFile('dist/angular/index.d.ts', typeOutput[0].code);

await mkdir('dist/demo', { recursive: true });
await copyFile('demo/index.html', 'dist/demo/index.html');
await copyFile(
  '../../samples/sagas/order/OrderStateMachine.saga.yaml',
  'dist/demo/order.saga.yaml',
);
