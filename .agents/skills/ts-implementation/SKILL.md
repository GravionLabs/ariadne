---
name: ts-implementation
description: 'TypeScript implementation and test rules (Vitest) extending `implementation`. Use when writing or changing TypeScript or Node.js code.'
---

## Framework

- **Tests**: Vitest — see `ts-test`
- **Format/Lint**: oxfmt + oxlint (`setup-oxc-husky`, ADR 0006 of GravionLabs/skills); projects not yet migrated keep Biome or ESLint + Prettier — see `## Format`

## Format

- Extensions: prettier `.ts .tsx .js .mjs .cjs .jsx .json .css .html`; eslint only `.ts .tsx .js .mjs .cjs .jsx`
- Format: `npx --no-install prettier --write {files}` then `npx --no-install eslint --fix {files}`
- Check (read-only): `npx --no-install prettier --check {files}` and `npx --no-install eslint {files}`
- Biome project (`biome.json[c]`, the default for new plain-TS projects): `npx biome check --write --no-errors-on-unmatched {files}` / check `npx biome check --no-errors-on-unmatched {files}`; never run prettier on the same files
- oxc project (`.oxfmtrc.json[c]` / `.oxlintrc.json`, the default for new projects): `npx --no-install oxfmt --no-error-on-unmatched-pattern {files}` then `npx --no-install oxlint --fix --no-error-on-unmatched-pattern {files}` / check `npx --no-install oxfmt --check --no-error-on-unmatched-pattern {files}` and `npx --no-install oxlint --no-error-on-unmatched-pattern {files}`; oxfmt also formats `.md .yml .yaml`
- Run after green tests, before the commit: `pwsh <implementation dir>/scripts/Format-Changed.ps1 -Language ts` (`-Check` for the check commands; not-configured, override: references/format.md of `implementation`)

## Imports

- ES modules only — `import` not `require`
- Relative imports carry the `.js` extension (`import { foo } from "../foo.js"`) only when `moduleResolution` is `NodeNext`/`Node16`; with `bundler` (Vite, Angular) follow the project

## Conventions

- Types: never `any`. Use explicit interfaces or type aliases.
- Async: `async/await` only, no raw `.then()`.
- File naming: `kebab-case.ts`.

## Tests

Runner config, test file naming, mocking and coverage live in `ts-test`.

## Gate

Run `pnpm check:changed` once when the work is done (the gate of this stack; `implementation` runs it through `Invoke-Gate.ps1`): `../../shared/implementation/references/gate.md`.

## Review rules

- 🔴 Lint run (`Format-Changed.ps1 -Lint -Language ts`, oxlint, ESLint or Biome) exits non-zero: error-level findings; 🟡 warning-level findings
- No `any` — use `unknown` and narrow; `strict: true` in `tsconfig.json`
- No floating promises; async functions propagate or handle errors
- ESM `import` only; `path.join`/`path.resolve` for file paths
- No `eval()`/`new Function()`; validate input before queries, paths, shell commands
- Tests isolated with specific assertions (not just `toBeTruthy()`) — rules in `ts-test`
