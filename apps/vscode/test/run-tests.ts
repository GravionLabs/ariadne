import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

// Starts VS Code with the extension and runs the mocha suites in `suite/`. Set
// ARIADNE_VSCODE_PATH to use an installed VS Code instead of downloading one.
async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index');
  const workspace = path.resolve(extensionDevelopmentPath, 'test', 'fixtures');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    vscodeExecutablePath: process.env['ARIADNE_VSCODE_PATH'],
    launchArgs: [workspace, '--disable-extensions'],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
