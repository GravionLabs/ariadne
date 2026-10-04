// Builds the package and packs it as `npm/ariadne-viewer-<version>.tgz`.
//
//   pnpm --filter @ariadne/viewer package [version]
//
// The default version is the one in package.json (0.0.0); the release pipeline gives the version of
// the release (GitVersion), so what is published has the version of its tag. package.json itself is
// put back afterwards.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const requested = process.argv[2];
if (requested && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(requested)) {
  console.error(`The version must be semver, not "${requested}".`);
  process.exit(2);
}
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

run('pnpm', ['build']);
// The license of the repository goes into the package (a copy that is not committed).
copyFileSync(resolve(root, '../../LICENSE'), resolve(root, 'LICENSE'));

const manifestPath = resolve(root, 'package.json');
const original = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(original);
manifest.version = requested ?? manifest.version;
rmSync(resolve(root, 'npm'), { recursive: true, force: true });
mkdirSync(resolve(root, 'npm'));
try {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run('pnpm', ['pack', '--pack-destination', 'npm']);
} finally {
  writeFileSync(manifestPath, original);
}
