import * as fs from 'node:fs';
import * as path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'node:fs/promises';

interface Retried {
  title: string;
  retries: number;
}

/** ARIADNE_TEST_RETRIES=0 turns the safety net off, to measure flakiness. */
function retryCount(): number {
  const wanted = Number(process.env['ARIADNE_TEST_RETRIES'] ?? 1);
  return Number.isInteger(wanted) && wanted >= 0 ? wanted : 1;
}

/** `test-results/` at the root of the repository, next to the unit tests' reports. */
const RESULTS = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'test-results',
  'vscode-retries.json',
);

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 20_000,
    // The tests drive a real window; a step that races the UI gets another try, and the retry is
    // reported below instead of hidden.
    retries: retryCount(),
    // ARIADNE_TEST_GREP=sync runs only the tests whose name matches.
    grep: process.env['ARIADNE_TEST_GREP'],
  });

  // A test that passed only after a retry is flaky: remember it.
  const retried: Retried[] = [];
  mocha.suite.afterEach(function (this: Mocha.Context) {
    const test = this.currentTest;
    // `currentRetry` is public in Mocha, but its typings declare it protected.
    const retries =
      (test as unknown as { currentRetry(): number } | undefined)?.currentRetry() ?? 0;
    if (test?.state === 'passed' && retries > 0) retried.push({ title: test.fullTitle(), retries });
  });

  const root = __dirname;
  for await (const file of glob('**/*.test.js', { cwd: root })) {
    mocha.addFile(path.resolve(root, file));
  }
  try {
    await new Promise<void>((resolve, reject) =>
      mocha.run((failures) =>
        failures ? reject(new Error(`${failures} tests failed.`)) : resolve(),
      ),
    );
  } finally {
    reportRetries(retried);
  }
}

function reportRetries(retried: Retried[]): void {
  for (const { title, retries } of retried) {
    console.warn(`FLAKY: "${title}" needed ${retries} ${retries === 1 ? 'retry' : 'retries'}`);
    if (process.env['GITHUB_ACTIONS'] === 'true') {
      console.log(`::warning title=Flaky VS Code test::${title} needed ${retries} retries`);
    }
  }
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
  fs.writeFileSync(RESULTS, `${JSON.stringify(retried, null, 2)}\n`);
}
