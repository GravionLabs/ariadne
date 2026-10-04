import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'node:fs/promises';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 20_000,
    // The tests drive a real window; a step that races the UI gets two more tries.
    retries: 2,
    // ARIADNE_TEST_GREP=sync runs only the tests whose name matches.
    grep: process.env['ARIADNE_TEST_GREP'],
  });
  const root = __dirname;
  for await (const file of glob('**/*.test.js', { cwd: root })) {
    mocha.addFile(path.resolve(root, file));
  }
  await new Promise<void>((resolve, reject) =>
    mocha.run((failures) =>
      failures ? reject(new Error(`${failures} tests failed.`)) : resolve(),
    ),
  );
}
