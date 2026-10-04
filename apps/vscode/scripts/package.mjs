// Builds the extension and packs it as `vsix/ariadne-vscode-<version>.vsix`.
//
//   pnpm --filter ariadne-vscode package [version]
//
// The version is major.minor.patch (the marketplace takes nothing else); the default is the one in
// package.json. The release pipeline gives the version of the release (GitVersion), so the file the
// release carries has the version of its tag. package.json itself is not changed.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVSIX } from '@vscode/vsce';

const root = fileURLToPath(new URL('..', import.meta.url));
const requested = process.argv[2];
if (requested && !/^\d+\.\d+\.\d+$/.test(requested)) {
  console.error(`The version must be major.minor.patch, not "${requested}".`);
  process.exit(2);
}

execFileSync('pnpm', ['build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

mkdirSync(resolve(root, 'vsix'), { recursive: true });
const version =
  requested ?? (await import('../package.json', { with: { type: 'json' } })).default.version;
const packagePath = resolve(root, `vsix/ariadne-vscode-${version}.vsix`);
await createVSIX({
  cwd: root,
  packagePath,
  version: requested,
  // Everything the extension needs is in `dist` (bundled by esbuild): no node_modules.
  dependencies: false,
  updatePackageJson: false,
  gitTagVersion: false,
  // The repository has no license file yet; the manifest does not claim one.
  skipLicense: true,
});
console.log(packagePath);
