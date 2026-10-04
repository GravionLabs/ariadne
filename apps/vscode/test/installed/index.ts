import * as path from 'node:path';
import Mocha from 'mocha';

/** Runs the tests of the installed package (`pnpm test:vsix`). */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 90_000, retries: 1 });
  mocha.addFile(path.resolve(__dirname, 'installed.test.js'));
  await new Promise<void>((resolve, reject) =>
    mocha.run((failures) =>
      failures ? reject(new Error(`${failures} tests failed.`)) : resolve(),
    ),
  );
}
