// Installs the .vsix into a clean VS Code and runs the tests of `test/installed` there, so what
// the package leaves out (a WebAssembly file, the font, the webview) is noticed before a release.
//
//   pnpm --filter ariadne-vscode test:vsix [file.vsix]
//
// Without a file, the newest one in `vsix/` is used. ARIADNE_VSCODE_PATH uses an installed VS Code
// instead of the downloaded one.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';

const root = fileURLToPath(new URL('..', import.meta.url));

function newestVsix() {
  const dir = resolve(root, 'vsix');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.vsix'))
    .map((f) => ({ file: join(dir, f), time: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (!files[0]) throw new Error('No .vsix in vsix/: run `pnpm package` first.');
  return files[0].file;
}

const vsix = resolve(process.argv[2] ?? newestVsix());
const version = /ariadne-vscode-(\d+\.\d+\.\d+)\.vsix$/.exec(vsix)?.[1];
if (!version) throw new Error(`${vsix} is not named ariadne-vscode-<version>.vsix.`);

const work = mkdtempSync(join(tmpdir(), 'ariadne-vsix-'));
const extensionsDir = join(work, 'extensions');
const userDataDir = join(work, 'user-data');

try {
  const executable =
    process.env.ARIADNE_VSCODE_PATH ??
    (await downloadAndUnzipVSCode({ cachePath: resolve(root, '.vscode-test') }));
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, {
    reuseMachineInstall: false,
  });
  const profile = [`--extensions-dir=${extensionsDir}`, `--user-data-dir=${userDataDir}`];
  const run = (args) =>
    spawnSync(cli, [...cliArgs, ...profile, ...args], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });

  console.log(`Installing ${vsix}`);
  const installed = run(['--install-extension', vsix, '--force']);
  process.stdout.write(installed.stdout ?? '');
  if (installed.status !== 0) {
    process.stderr.write(installed.stderr ?? '');
    throw new Error('VS Code could not install the .vsix.');
  }
  const listed = run(['--list-extensions', '--show-versions']).stdout ?? '';
  if (!listed.includes(`gravionlabs.ariadne-vscode@${version}`)) {
    throw new Error(`Not installed as version ${version}. VS Code lists:\n${listed}`);
  }

  process.env.ARIADNE_VSIX_VERSION = version;
  process.env.ARIADNE_INSTALL_ROOT = extensionsDir;
  await runTests({
    vscodeExecutablePath: executable,
    // An empty extension to start from: the one under test is the installed one, not the source.
    extensionDevelopmentPath: resolve(root, 'test/installed-host'),
    extensionTestsPath: resolve(root, 'dist-test/installed/index'),
    launchArgs: [work, ...profile, '--disable-workspace-trust'],
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
