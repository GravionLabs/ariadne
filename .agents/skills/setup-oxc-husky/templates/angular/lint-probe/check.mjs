// Lint probe (ADR 0006 of GravionLabs/skills): oxlint loads @angular-eslint/eslint-plugin as an alpha JS plugin, and
// ESLint lints the templates. A tool update that silently drops a rule passes `pnpm lint`; this check fails instead.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  return `${r.stdout}\n${r.stderr}`;
};

const expected = {
  oxlint: [
    'component-selector',
    'prefer-standalone',
    'no-output-native',
    'no-output-on-prefix',
    'no-empty-lifecycle-method',
    'component-max-inline-declarations',
  ],
  eslint: ['alt-text', 'banana-in-box'],
};
// the probe is in the ignore patterns of the regular run: oxlint gets a copy of the project config without them
// (next to the probe, so the JS plugin resolves from the project), ESLint gets --no-ignore
const probeConfig = new URL('.oxlintrc.probe.json', import.meta.url);
const config = JSON.parse(readFileSync(new URL('../.oxlintrc.json', import.meta.url), 'utf8'));
delete config.ignorePatterns;
writeFileSync(probeConfig, JSON.stringify(config));
const output = {};
try {
  output.oxlint = run('npx', ['--no-install', 'oxlint', '-c', '.oxlintrc.probe.json', 'probe.ts']);
} finally {
  rmSync(probeConfig, { force: true });
}
output.eslint = run('npx', ['--no-install', 'eslint', '--no-ignore', '-c', '../eslint.config.mjs', 'probe.html']);

const missing = Object.entries(expected).flatMap(([tool, rules]) =>
  rules.filter((rule) => !output[tool].includes(rule)).map((rule) => `${tool}: ${rule}`),
);
if (missing.length) {
  console.error(`lint probe: rules no longer reported:\n  ${missing.join('\n  ')}`);
  console.error(output.oxlint, output.eslint);
  process.exit(1);
}
console.log(`lint probe: ${Object.values(expected).flat().length} rules reported`);
