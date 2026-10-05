# ADR 0019: Dependency updates and supply chain: Renovate, reviewed install scripts, code scanning

- Status: accepted
- Date: 2026-10-04
- Issues: #285, #310, #311, #312
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

### Install scripts are reviewed (#311)

A package that runs a script when it is installed runs code on every developer machine and CI runner. In
`pnpm-workspace.yaml`:

- `allowBuilds` lists every package with an install script as `true` (may run) or `false` (may not), with a one-line
  reason. Today the ones that run are the prebuilt-binary selectors of the Angular build (`@parcel/watcher`, `esbuild`,
  `lmdb`, `msgpackr-extract`); the two that do not are packages whose native part Ariadne does not use
  (`tree-sitter-c-sharp`, `@vscode/vsce-sign`).
- **`strictDepBuilds: true`** makes `pnpm install` fail (`ERR_PNPM_IGNORED_BUILDS`) when a package with a script is in
  neither list, in CI too (`--frozen-lockfile`). pnpm 11 does this by default; the setting is explicit so a change of
  the default cannot loosen it. The alternative, skipping unknown scripts with a warning, hides a new package that
  would not work, or one that should not run.
- **Reviewing a package that wants to build:** read the script (what does it download or compile, from where?); check
  whether a prebuilt binary or WebAssembly makes it unnecessary (then `false`); if it is needed, `true`, with the reason.
  Replace the `set this to true or false` line pnpm leaves in `allowBuilds` after a failed install with the decision
  and the reason. A Renovate pull request that fails on this needs a person, not a rerun.

### Code scanning (#312)

- **CodeQL** (`.github/workflows/codeql.yml`) scans `javascript-typescript` and `actions` (the workflows themselves,
  where an injection through `${{ … }}` in a `run:` step is the classic mistake) on pull requests, on `main` and weekly.
  It runs the `security-extended` queries (`.github/codeql/codeql-config.yml`), which is more than the default suite
  and still security only. The weekly run matters: new queries find old code.
- **Advanced setup, not the default setup**, so the languages, the queries and the ignored paths are reviewed and
  versioned with the code. `dist`, `node_modules`, `samples/generated` (C# that is generated and not shipped) and `docs`
  are not scanned.
- **No build**: JavaScript and TypeScript are analysed from source (`build-mode: none`).
- The repository is private, so scanning needs **GitHub Code Security**; without it the upload of the results fails.
  Secret scanning with push protection (Secret Protection) is worth enabling next to it.
- A finding is fixed, filed as a bug under #285 when it is not small, or dismissed in the Security tab with a reason
  when it is a false positive.

### Actions are pinned to commit SHAs (#367)

A tag (`actions/checkout@v4`) or a branch (`GravionLabs/ci/node/setup@main`) can be moved by whoever owns the
repository of the action, and the next run of a workflow would run the new code with the repository's token.
Every `uses:` in `.github/workflows` is therefore a full commit SHA with the version in a comment
(`actions/checkout@<sha> # v4`), which CodeQL's `actions/unpinned-tag` query checks. `helpers:pinGitHubActionDigests`
makes Renovate update the SHA and the comment together, so pinning costs a reviewed pull request, not a manual step.

### The configuration is checked

`renovate-config-validator --strict` runs in CI when the configuration changes (`.github/workflows/renovate-config.yml`),
so a typo does not silently stop the updates.

## Consequences

- Renovate runs from `.github/workflows/renovate.yml` (weekly, or by hand) instead of the Renovate GitHub app, which
  the owner did not want to install. It needs the repository secret `RENOVATE_TOKEN` (a token that may write
  contents, pull requests and workflows): pull requests opened with `GITHUB_TOKEN` would not start CI.
- A new package family needs a line in a group, or it gets a pull request of its own.
- Every week there are a handful of pull requests instead of dozens. The Dependency Dashboard issue lists what is
  waiting.
