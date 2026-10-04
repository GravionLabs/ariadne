// Starts the VS Code the integration tests use (downloaded to .vscode-test) with the extension
// under development and its own profile, so nothing of your own VS Code is touched.
//
//   pnpm --filter ariadne-vscode dev [folder] [--with-yaml]
//
// - folder: what to open; default is the `samples` folder of the repository.
// - --with-yaml: also install the Red Hat YAML extension into this profile (once), to try the
//   JSON Schema for *.saga.yaml.
// - ARIADNE_VSCODE_PATH uses another VS Code instead of the downloaded one.
//
// The extension host listens on port 9229: attach the "Attach to Extension Host" launch
// configuration to debug.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const withYaml = args.includes('--with-yaml');
const folder = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(root, '../../samples'));

const executable =
  process.env.ARIADNE_VSCODE_PATH ??
  (await downloadAndUnzipVSCode({ cachePath: resolve(root, '.vscode-test') }));
const profile = [
  `--user-data-dir=${resolve(root, '.vscode-test/dev-profile')}`,
  `--extensions-dir=${resolve(root, '.vscode-test/dev-extensions')}`,
];

if (withYaml) {
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, {
    reuseMachineInstall: false,
  });
  spawnSync(cli, [...cliArgs, ...profile, '--install-extension', 'redhat.vscode-yaml'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

console.log(`Starting ${executable}\nOpening ${folder}`);
const child = spawn(
  executable,
  [
    folder,
    ...profile,
    `--extensionDevelopmentPath=${root}`,
    '--inspect-extensions=9229',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
  ],
  { stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 0));
