import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'node:fs/promises';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 20_000 });
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
