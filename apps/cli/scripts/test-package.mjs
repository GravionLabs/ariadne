// Installs the packed tarball into an empty project, as a user would, and runs the command: the
// version, a lint, an import (the WebAssembly parser next to the script) and a PNG export (the native
// renderer). Also checks that the manifest does not refer to the workspace.
//
//   pnpm --filter @ariadne/cli test:package
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(root, '../..');
const tarball = readdirSync(resolve(root, 'npm')).find((f) => /^ariadne-cli-.+\.tgz$/.test(f));
if (!tarball) throw new Error('No tarball in npm/: run `pnpm package` first.');
const version = /^ariadne-cli-(.+)\.tgz$/.exec(tarball)[1];

const project = mkdtempSync(join(tmpdir(), 'ariadne-cli-'));
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: project,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
try {
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'user', private: true }));
  // `--ignore-workspace`: the project is outside the repository's workspace. The native renderer
  // has an install script; it is allowed here as a user's npm would.
  run('pnpm', [
    'add',
    '--ignore-workspace',
    '--config.strict-dep-builds=false',
    resolve(root, 'npm', tarball),
  ]);

  const installed = join(project, 'node_modules/@ariadne/cli');
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  const problems = [];
  if (JSON.stringify(manifest).includes('workspace:')) problems.push('a workspace: reference');
  if (manifest.private) problems.push('the package is private');
  const deps = Object.keys(manifest.dependencies ?? {});
  if (deps.join() !== '@resvg/resvg-js')
    problems.push(`dependencies should be only @resvg/resvg-js, are ${deps}`);
  for (const file of [
    'dist/ariadne.mjs',
    'dist/tree-sitter-c_sharp.wasm',
    'dist/web-tree-sitter.wasm',
    'LICENSE',
    'README.md',
  ]) {
    if (!existsSync(join(installed, file))) problems.push(`${file} is missing`);
  }
  if (problems.length) throw new Error(problems.join('; '));

  const ariadne = (...args) =>
    run(process.execPath, [join(installed, 'dist/ariadne.mjs'), ...args]);
  const shown = ariadne('--version').trim();
  if (shown !== version) throw new Error(`--version says "${shown}", the package is ${version}`);
  ariadne('lint', resolve(repo, 'docs/examples/order.saga.yaml'));
  ariadne('import', resolve(repo, 'samples/sagas/order/OrderStateMachine.cs'), '-o', project);
  if (!existsSync(join(project, 'OrderStateMachine.saga.yaml')))
    throw new Error('import wrote no diagram');
  ariadne(
    'export',
    resolve(repo, 'docs/examples/order.saga.yaml'),
    '--format',
    'png',
    '-o',
    join(project, 'order.png'),
  );
  const png = readFileSync(join(project, 'order.png'));
  if (png.subarray(1, 4).toString() !== 'PNG') throw new Error('export wrote no PNG');
  // The bin entry works too (what `npm install -g` links).
  if (!existsSync(join(project, 'node_modules/.bin/ariadne')))
    throw new Error('no ariadne in node_modules/.bin');
  console.log(`ariadne ${version}: the packed command installs and runs.`);
} finally {
  rmSync(project, { recursive: true, force: true });
}
