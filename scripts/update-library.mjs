// Rewrites what is derived from the hand-written C# of every sample in samples/library:
//   <name>.saga.yaml   the diagram the importer reads from the C# (the golden),
//   generated/         the C# the generator writes for that diagram,
//   <name>.docs.md     the Markdown page of that diagram.
// It uses the built command line (`pnpm --filter @ariadne/cli build` first), the same code as
// `ariadne import`, `ariadne generate` and `ariadne export --format md`. The tests in
// packages/masstransit/src/library.spec.ts fail when these files are not what this writes.
//
// Usage: node scripts/update-library.mjs [sample-name…]   (all samples without arguments)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const library = join(root, 'samples/library');
const cli = join(root, 'apps/cli/dist/ariadne.mjs');

if (!existsSync(cli)) {
  console.error('Build the command line first: pnpm --filter @ariadne/cli build');
  process.exit(2);
}

/** Runs the command line; anything it says on stderr (a warning, an error) is a failure. */
function ariadne(...args) {
  const run = spawnSync('node', [cli, ...args], { encoding: 'utf8' });
  if (run.status !== 0 || run.stderr.trim()) {
    throw new Error(`ariadne ${args.join(' ')}\n${run.stderr.trim() || `exit code ${run.status}`}`);
  }
  return run.stdout;
}

const samples = readdirSync(library).filter((name) => statSync(join(library, name)).isDirectory());
const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !samples.includes(name));
if (unknown.length) {
  console.error(`No such sample: ${unknown.join(', ')}. Samples: ${samples.join(', ')}`);
  process.exit(2);
}

let failed = false;
for (const name of wanted.length ? wanted : samples) {
  const dir = join(library, name);
  const csharp = readdirSync(dir)
    .filter((f) => f.endsWith('.cs'))
    .map((f) => join(dir, f));
  const work = mkdtempSync(join(tmpdir(), `ariadne-library-${name}-`));
  try {
    // Import: one saga, named after its class by the command line; the sample names it after its folder.
    ariadne('import', ...csharp, '-o', work);
    const imported = readdirSync(work).filter((f) => f.endsWith('.saga.yaml'));
    if (imported.length !== 1)
      throw new Error(`${name}: expected one saga, found ${imported.length}`);
    const diagram = join(dir, `${name}.saga.yaml`);
    copyFileSync(join(work, imported[0]), diagram);
    // Generate and export from the diagram.
    rmSync(join(dir, 'generated'), { recursive: true, force: true });
    ariadne('generate', diagram, '-o', join(dir, 'generated'));
    ariadne('export', diagram, '--format', 'md', '-o', join(dir, `${name}.docs.md`));
    console.log(`updated ${name}`);
  } catch (e) {
    failed = true;
    console.error(`FAILED ${name}: ${e.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
