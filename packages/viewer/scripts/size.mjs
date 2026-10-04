// Measures the files of the built viewer (`pnpm build` or `pnpm package` first) and checks them
// against the budgets of size-budget.mjs. Exits with 1 when one is over its budget.
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { BUDGETS, evaluate, table } from './size-budget.mjs';

const sizes = [];
for (const file of Object.keys(BUDGETS)) {
  const bytes = await readFile(new URL(`../${file}`, import.meta.url));
  sizes.push({ file, raw: bytes.length, gzip: gzipSync(bytes).length });
}
const results = evaluate(sizes);
console.log(table(results));

for (const r of results) {
  const used = `${Math.round(r.share * 100)}% of its ${r.budget} bytes (gzip)`;
  if (r.status === 'warning') console.log(`::warning title=Bundle size::${r.file} is ${used}`);
  if (r.status === 'over') console.log(`::error title=Bundle size::${r.file} is ${used}`);
}
process.exitCode = results.some((r) => r.status === 'over') ? 1 : 0;
