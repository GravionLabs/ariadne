// Builds the command with the version of a release and packs it as `npm/ariadne-cli-<version>.tgz`,
// the file attached to the GitHub release.
//
//   pnpm --filter @ariadne/cli package [version]
//
// The bundle has the packages of the workspace inside it, so the packed manifest lists only what is
// not bundled: @resvg/resvg-js, which has a native part that npm installs for the platform. The
// manifest is written into a staging folder; the package.json of the repository is put back.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const requested = process.argv[2];
if (requested && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(requested)) {
  console.error(`The version must be semver, not "${requested}".`);
  process.exit(2);
}
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

const manifestPath = resolve(root, 'package.json');
const original = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(original);
const version = requested ?? manifest.version;
// `ariadne --version` reads the version from package.json at build time.
try {
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  run('pnpm', ['build']);
} finally {
  writeFileSync(manifestPath, original);
}

const out = resolve(root, 'npm');
const stage = resolve(out, 'stage');
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
copyFileSync(resolve(root, 'README.md'), resolve(stage, 'README.md'));
copyFileSync(resolve(root, '../../LICENSE'), resolve(stage, 'LICENSE'));
const packed = {
  name: manifest.name,
  version,
  description: manifest.description,
  license: 'MIT',
  type: 'module',
  bin: manifest.bin,
  files: ['dist'],
  engines: manifest.engines,
  homepage: 'https://gravionlabs.github.io/ariadne/',
  repository: {
    type: 'git',
    url: 'git+https://github.com/GravionLabs/ariadne.git',
    directory: 'apps/cli',
  },
  dependencies: { '@resvg/resvg-js': manifest.dependencies['@resvg/resvg-js'] },
};
writeFileSync(resolve(stage, 'package.json'), `${JSON.stringify(packed, null, 2)}\n`);
run('pnpm', ['pack', '--pack-destination', out], stage);
rmSync(stage, { recursive: true, force: true });
// The tarball is named after the package (`ariadne-cli-<version>.tgz`, without the scope).
console.log(`Packed ${resolve(out, `ariadne-cli-${version}.tgz`)}`);
