# ADR 0019: Dependency updates and supply chain: Renovate, reviewed install scripts, code scanning

- Status: accepted
- Date: 2026-10-04
- Issues: #285, #310
- Builds on: [ADR 0006](0006-typescript-monorepo.md), [ADR 0015](0015-versioning-and-releases.md)

## Context

Ariadne has about sixty direct dependencies in a pnpm workspace (Angular, NgRx, Foblex, CodeMirror, tree-sitter,
the VS Code test tooling) and the GitHub Actions of its workflows. Left alone, they age; updated one by one, they
are a daily chore; updated blindly, they break things that only a real VS Code or a real build shows.

## Decision

### Renovate, grouped, gated by CI, merged by a person (#310)

- **Renovate** (`.github/renovate.json5`) updates npm packages and GitHub Actions. It was chosen over Dependabot
  for its pnpm workspace support and its grouping. There is no `.github/dependabot.yml`.
- **Weekly** (before 6 am on Monday, Europe/Zurich), with a monthly lockfile maintenance and `pnpmDedupe`. Ranges in
  `package.json` are bumped to the new version (`rangeStrategy: bump`).
- **Security updates are not scheduled.** `vulnerabilityAlerts` and `osvVulnerabilityAlerts` open a pull request
  (label `security`) as soon as a vulnerability is known. This also covers what a separate `pnpm audit` job would.
- **Commits are `chore(deps): …`**, so they stay out of the release notes (ADR 0015).
- **No automerge.** CI is the gate (build, unit tests, the integration tests in a real VS Code, the `.vsix` test,
  the generated-C# check), and a person merges. **Majors** get their own pull requests, labelled `major`.

### Groups

A group is a set of packages that must move together; one pull request is easier to review and to bisect than five.

| Group                    | Packages                                                                                                                         | Why                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| angular                  | `@angular/*`, `@angular-devkit/*`, `@schematics/angular`, `angular-eslint`, `zone.js`, `typescript`                              | Angular pins the TypeScript range it supports.                                                                                                |
| ngrx, foblex, codemirror | `@ngrx/*`; `@foblex/*`; `@codemirror/*`, `@lezer/*`                                                                              | Each family is released and tested together.                                                                                                  |
| vscode tooling           | `@vscode/*`, `@types/vscode`                                                                                                     | `@types/vscode` is held at `engines.vscode` (`<1.97.0` for `^1.96.0`): never newer than the VS Code the `.vsix` supports. Raise both by hand. |
| tree-sitter              | `tree-sitter-c-sharp`, `web-tree-sitter`                                                                                         | The WebAssembly files must stay compatible (the `.vsix` test checks it).                                                                      |
| build and test tooling   | `vitest`, `esbuild`, `rollup`, `rollup-plugin-dts`, `eslint`, `typescript-eslint`, `prettier`, `jsdom`, `axe-core`, `fast-check` | Tools that change output or reports, not behaviour.                                                                                           |
| types                    | `@types/*` except `@types/vscode`                                                                                                | Rarely matter, often come in numbers.                                                                                                         |
| github-actions           | every action                                                                                                                     | `GravionLabs/ci/*@main` is excluded: the organisation's shared workflows are followed on `main` on purpose.                                   |

### The configuration is checked

`renovate-config-validator --strict` runs in CI when the configuration changes (`.github/workflows/renovate-config.yml`),
so a typo does not silently stop the updates.

## Consequences

- The Renovate GitHub app has to be installed for the repository (an owner action); the configuration can be merged
  before that.
- A new package family needs a line in a group, or it gets a pull request of its own.
- Every week there are a handful of pull requests instead of dozens. The Dependency Dashboard issue lists what is
  waiting.
