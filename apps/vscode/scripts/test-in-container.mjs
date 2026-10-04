// Runs the VS Code integration tests in the dev container image, the one CI-like place to
// reproduce a failure that only happens in CI.
//
//   pnpm --filter ariadne-vscode test:integration:container
//
// It builds `.devcontainer/Dockerfile` (tag `ariadne-dev`; Docker caches it), mounts the repository,
// and runs `pnpm install --frozen-lockfile && pnpm --filter ariadne-vscode test:integration:ci`
// inside. The dependencies and the downloaded VS Code live in named volumes, so the host's native
// binaries are not mixed with the Linux ones and nothing is downloaded twice.
// ARIADNE_TEST_GREP and ARIADNE_TEST_RETRIES are passed through; the exit code is the container's.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)), '..', '..');
const IMAGE = 'ariadne-dev';
const WORKDIR = '/workspaces/ariadne';

function docker(args, options = {}) {
  return spawnSync('docker', args, { stdio: 'inherit', ...options });
}

const found = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
  stdio: 'ignore',
});
if (found.error || found.status !== 0) {
  console.error(
    'Docker is not available: install Docker (Docker Desktop on Windows or macOS) and start it,\n' +
      'then run this again. Without Docker, use `pnpm --filter ariadne-vscode test:integration:ci`.',
  );
  process.exit(2);
}

const build = docker([
  'build',
  '--tag',
  IMAGE,
  '--file',
  join(repo, '.devcontainer', 'Dockerfile'),
  join(repo, '.devcontainer'),
]);
if (build.status !== 0) process.exit(build.status ?? 1);

// One node_modules volume for the root and one per workspace project (pnpm keeps a folder in each).
// The names are those of .devcontainer/devcontainer.json, so both share their dependencies.
const projects = ['apps', 'packages'].flatMap((group) =>
  readdirSync(join(repo, group), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ dir: `${group}/${d.name}`, name: d.name })),
);
const volumes = [
  { source: 'ariadne-node-modules', target: `${WORKDIR}/node_modules` },
  ...projects.map(({ dir, name }) => ({
    source: `ariadne-node-modules-${name}`,
    target: `${WORKDIR}/${dir}/node_modules`,
  })),
  { source: 'ariadne-vscode-test', target: `${WORKDIR}/apps/vscode/.vscode-test` },
];

// The volumes start out owned by root. Fix that, then do the work as the user of the host, so the
// files the tests write into the repository (dist, test-results) belong to that user.
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;
const home = '/home/ariadne';
const script = [
  'set -e',
  `mkdir -p ${home} && chown ${uid}:${gid} ${home}`,
  `chown ${uid}:${gid} ${volumes.map((v) => v.target).join(' ')}`,
  // The pnpm store goes into the node_modules volume, not into the repository.
  `exec setpriv --reuid=${uid} --regid=${gid} --clear-groups env HOME=${home} ` +
    `npm_config_store_dir=${WORKDIR}/node_modules/.pnpm-store sh -c ` +
    "'pnpm install --frozen-lockfile && pnpm --filter ariadne-vscode test:integration:ci'",
].join('\n');

const env = ['ARIADNE_TEST_GREP', 'ARIADNE_TEST_RETRIES'].filter(
  (name) => process.env[name] !== undefined,
);
const run = docker([
  'run',
  '--rm',
  '--init',
  // Electron needs more shared memory than Docker's default 64 MB.
  '--shm-size=1g',
  '--volume',
  `${repo}:${WORKDIR}`,
  ...volumes.flatMap((v) => ['--volume', `${v.source}:${v.target}`]),
  '--workdir',
  WORKDIR,
  ...env.flatMap((name) => ['--env', name]),
  IMAGE,
  'bash',
  '-c',
  script,
]);
process.exit(run.status ?? 1);
