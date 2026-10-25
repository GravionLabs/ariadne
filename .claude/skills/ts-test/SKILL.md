---
name: ts-test
description: >
  TypeScript/Node.js test rules using Vitest. Covers test runner config,
  file naming, mocking patterns, coverage, and test-writing methodology.
---

## Prerequisites

- Node.js 22 LTS
- Project root with `vitest.config.ts`

## Test Runner

- **Framework**: Vitest (`globals: true`, `environment: node`)
- **Config**: `vitest.config.ts` at project root
- **Run all**: `<pm> test` (package manager from `detect-techstack`)
- **Run single file**: `npx vitest run <path>`
- **Targeted run** (per commit, test files of the changed paths): `npx vitest run <path> <path>`; unknown mapping: the project's fast script (e.g. `<pm> run test:unit`), never the full suite

### File Naming

- Test files: `*.test.ts` (co-located with source)
- E2E / integration: `*.e2e.test.ts` or `*.int.test.ts`

### Coverage

```powershell
npx vitest run --coverage
```

- Requires `@vitest/coverage-v8` as a devDependency (`ts-create-project` adds it and the `test:ci` script)
- Output: `coverage/` directory; CI publishes `cobertura-coverage.xml`

### Mocking

- Function-level: `vi.fn()`
- Module-level: `vi.mock("module-path")` — only when unavoidable; avoid when inline mocking suffices
- Reset mocks in `beforeEach` (`vi.clearAllMocks()`) so tests stay isolated

## Writing Tests

1. Read target code — structure, dependencies, existing test patterns
2. Identify test cases — happy path, boundary values, error handling, null/empty inputs
3. Write `describe`/`it` blocks in BDD style: one top-level `describe` per service/module, nested `describe` for unit vs integration
4. Use the mocking already in the project (`vi.fn()`, `vi.mock()`); no new test libraries
5. Cover at minimum: happy path, one error path, one boundary case per method

```typescript
describe('UserService', () => {
  describe('unit', () => {
    it('returns user when valid id', () => { ... });
    it('throws when null id', () => { ... });
  });
  describe('integration', () => {
    it('persists user to database', () => { ... });
  });
});
```

## Gotchas

- Tests must be hermetic — no network calls, no shared state
- Use `vi.useFakeTimers()` for timer-dependent code
- Coverage threshold may be enforced in CI
- One test file per source module, mirroring the source structure
- Assert directly in test methods, no test logic in helpers; prefer specific assertions
- No debug code or `console.log` in committed tests
