---
name: ts-implementation
description: 'TypeScript implementation and test rules (Vitest) extending `implementation`. Loaded when `implementation` dispatches to ts-implementation.'
---

## Framework

- **Tests**: Vitest — see `ts-test`
- **Format/Lint**: ESLint (flat config) + Prettier — see `setup-prettier-eslint-husky`
- **Runtime**: Node.js 22 LTS

## Imports

- ES modules only — `import` not `require`
- Relative paths with `.js` extension: `import { foo } from "../foo.js"`

## Conventions

- Types: never `any`. Use explicit interfaces or type aliases.
- Async: `async/await` only, no raw `.then()`.
- File naming: `kebab-case.ts`.

## Tests

Runner config, test file naming, mocking and coverage live in `ts-test`.

## Review rules

- No `any` — use `unknown` and narrow; `strict: true` in `tsconfig.json`
- No floating promises; async functions propagate or handle errors
- ESM `import` only; `path.join`/`path.resolve` for file paths
- No `eval()`/`new Function()`; validate input before queries, paths, shell commands
- Tests isolated with specific assertions (not just `toBeTruthy()`) — rules in `ts-test`
