# ADR 0019: Dependency updates and supply chain: Renovate, reviewed install scripts, code scanning

- Status: accepted
- Date: 2026-10-04
- Issues: #285, #310, #311, #312, #362, #522
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
| github-actions           | every action                                                                                                                     | `GravionLabs/ci/*` is not pinned to a SHA: it follows the major tag `@v1` (below); a new major opens a pull request.                          |

### Install scripts are reviewed (#311)

A package that runs a script when it is installed runs code on every developer machine and CI runner. In
`pnpm-workspace.yaml`:

- `allowBuilds` lists every package with an install script as `true` (may run) or `false` (may not), with a one-line
  reason. Today the ones that run are the prebuilt-binary selectors of the Angular build (`@parcel/watcher`, `esbuild`,
  `lmdb`, `msgpackr-extract`); the two that do not are packages whose native part Ariadne does not use
  (`tree-sitter-c-sharp`, `@vscode/vsce-sign`).
- **`strictDepBuilds: true`** makes `pnpm install` fail (`ERR_PNPM_IGNORED_BUILDS`) when a package with a script is in
  neither list, in CI too (`--frozen-lockfile`). pnpm 12 does this by default; the setting is explicit so a change of
  the default cannot loosen it. The alternative, skipping unknown scripts with a warning, hides a new package that
  would not work, or one that should not run.
- **Reviewing a package that wants to build:** read the script (what does it download or compile, from where?); check
  whether a prebuilt binary or WebAssembly makes it unnecessary (then `false`); if it is needed, `true`, with the reason.
  Replace the `set this to true or false` line pnpm leaves in `allowBuilds` after a failed install with the decision
  and the reason. A Renovate pull request that fails on this needs a person, not a rerun.

The `allowBuilds` list was reviewed again for pnpm 12 (#521): `pnpm install` with `strictDepBuilds` passes and no
package with an install script was added, so the decisions above are unchanged.

### Updates held back (#521)

Renovate rules in `.github/renovate.json5` keep one update out until its reason is gone:

- **TypeScript `<6.1`**: Angular 22.2 (`@angular/compiler-cli`, `@angular/build`) declares the peer range
  `typescript >=6.0 <6.1`. Raise it with the Angular release that allows 7.

The Node.js holds of #521 (`@types/node` `<25`, the `node` Docker image `<23`) ended with the move to Node.js 26 (#476):
`.nvmrc`, CI, both Dockerfiles, `@types/node` and `engines` are on 26.

Node.js 26 images (`node:26-alpine`, `javascript-node:5-26-trixie`) do not bundle corepack, so `RUN corepack enable`
failed (#531). Corepack stays the way pnpm is provided: both Dockerfiles run `npm install -g corepack@<exact version>`
before `corepack enable`. The version is an `ARG COREPACK_VERSION` with a `# renovate:` annotation, which a
`customManagers` regex rule in `.github/renovate.json5` updates (the Dockerfile manager does not see an `npm install`
pin). The pin is the newest version at least as old as the minimum release age (pnpm's default of 1440 minutes): 0.36.0,
published 2026-08-28; it installs the `packageManager` pnpm (12.18.0). On a local Node.js 26, run
`npm install -g corepack` once.

Two more facts of the Node.js 26 images (#531). The `javascript-node` image already ships a pnpm shim in the global npm
bin, so `npm install -g corepack` stops with `EEXIST`; the dev container Dockerfile uses `--force`, and corepack then
takes over the `pnpm` and `pnpx` names. And the Node.js 26 binary links `libatomic.so.1`, which a bare `alpine` image
lacks: the runtime stage of the production Dockerfile installs `libatomic` next to `libstdc++`.

Releases younger than the minimum release age (at the time: eslint 10.15.0, Playwright 1.65.1) were not taken and no
exclusion was used; Renovate picks them up once they are old enough.

Renovate holds the same line: `minimumReleaseAge: '3 days'` with `internalChecksFilter: 'strict'` in
`.github/renovate.json5` opens no pull request for a release younger than three days (pnpm's own one day still applies
on install). Security fixes from `vulnerabilityAlerts` are exempt (`minimumReleaseAge: null`), so a fix is not delayed.

### Code scanning (#312)

- **CodeQL** (`.github/workflows/codeql.yml`) scans `javascript-typescript` and `actions` (the workflows themselves,
  where an injection through `${{ … }}` in a `run:` step is the classic mistake) on pull requests, on `main` and weekly.
  It runs the `security-extended` queries (`.github/codeql/codeql-config.yml`), which is more than the default suite
  and still security only. The weekly run matters: new queries find old code.
- **Advanced setup, not the default setup**, so the languages, the queries and the ignored paths are reviewed and
  versioned with the code. `dist`, `node_modules`, `samples/generated` (C# that is generated and not shipped) and `docs`
  are not scanned.
- **No build**: JavaScript and TypeScript are analysed from source (`build-mode: none`).
- The repository is public (#522): code scanning, secret scanning and push protection are free. This replaces the
  "out of scope" decision of #362, which kept them off while the repository was private.
- A finding is fixed, filed as a bug under #285 when it is not small, or dismissed in the Security tab with a reason
  when it is a false positive.

### Review of the supply chain before publishing packages (#522)

The review of November 2026, with the repository public and npm, Marketplace and NuGet publishing coming (#502).

- **Versions.** `renovatebot/github-action` v46.3.13 and `github/codeql-action` v4.39.3 were already the newest
  majors, pinned by commit SHA. The Renovate version is stated in `renovate.yml` (`renovate-version: 44.239.1`) and
  kept current by a custom manager; the configuration passes `renovate-config-validator --strict` and uses no
  deprecated option.
- **Rate limits.** `prHourlyLimit: 10` and `prConcurrentLimit: 20` (defaults 2 and 10): a week's updates are opened.
- **`minimumReleaseAge: '3 days'` is kept** (#534) for every update, with `internalChecksFilter: 'strict'`; security
  fixes are exempt. Three days is long enough for most compromised releases to be pulled and short enough not to
  starve the weekly run.
- **Ecosystems.** npm, GitHub Actions, Dockerfile, `compose.yaml`, the dev container, `.nvmrc` and NuGet
  (`*.csproj`, so the coming `dotnet/` folder of #506) come from `config:recommended`; a custom manager adds the
  .NET SDK of `setup-dotnet`. The inline project of `scripts/compile-generated.sh` (`MassTransit 8.*`) is a floating
  range and needs no update. A dry run (`workflow_dispatch`, `dry-run`) lists the managers.
- **CodeQL** keeps `security-extended` for `javascript-typescript` and `actions`; `csharp` is added to the matrix
  with #506 (a comment marks the place). One open alert (`actions/unpinned-tag`, number 31) concerns the
  `GravionLabs/ci@v1` exception above: dismiss it as "won't fix" with that reason.
- **Dependency review** (`.github/workflows/dependency-review.yml`) fails a pull request on a new dependency with a
  high severity vulnerability or a license outside the allow list (permissive licenses, MPL-2.0, PSF-2.0). Exception: `@vscode/vsce-sign` and its platform variants
  (VS Code extension packaging dev tooling, Microsoft proprietary license, not shipped) are exempt from the license
  check through `allow-dependencies-licenses`, by purl without version.
- **Secret scanning and push protection are on**; **Dependabot alerts are on** as a second source next to
  `osvVulnerabilityAlerts`, **Dependabot security updates stay off** (Renovate opens those pull requests, two
  bots on one vulnerability would collide); **private vulnerability reporting is on** and `SECURITY.md` says how to
  report.

**Settings that need the owner's rights** (state of 2026-11-14 read with `gh api`, final state wanted):

- [x] Secret scanning: enabled. [x] Push protection: enabled.
- [ ] Scan the history once for secrets (Security > Secret scanning) and revoke every finding.
- [x] Dependabot alerts: enabled. [x] Dependabot security updates: disabled (final state).
- [x] Private vulnerability reporting: enabled.
- [ ] Code scanning alert 31 (`actions/unpinned-tag`): dismiss with the reason above.
- [ ] Ruleset `main` (id 24478507): add the required checks `Analyze (javascript-typescript)`, `Analyze (actions)` and
      `Dependency review` next to `Lint, build, test` and `pr-checks / PR checks`. Add them once the workflows have run on
      the release branch.
- [ ] Renovate dry run (pending): run the `renovate` workflow by hand (`workflow_dispatch`, input `dry-run`) and confirm the
      detected managers: npm, github-actions, dockerfile, docker-compose, devcontainer, `.nvmrc`, nuget and the two custom
      managers.
- [ ] `RENOVATE_TOKEN`: check scopes (contents, pull requests and workflows write, issues write for the dashboard, on
      this repository only) and the expiry; prefer a fine-grained token that expires within a year, and note the
      expiry date here (not the value). Not readable through the API.

### Actions are pinned to commit SHAs (#367)

A tag (`actions/checkout@v4`) or a branch (`GravionLabs/ci/node/setup@main`) can be moved by whoever owns the
repository of the action, and the next run of a workflow would run the new code with the repository's token.
Every `uses:` in `.github/workflows` is therefore a full commit SHA with the version in a comment
(`actions/checkout@<sha> # v4`), which CodeQL's `actions/unpinned-tag` query checks. `helpers:pinGitHubActionDigests`
makes Renovate update the SHA and the comment together, so pinning costs a reviewed pull request, not a manual step.

**The exception is GravionLabs/ci (#479).** The organisation's own actions and reusable workflows are referenced at
the moving major tag, `GravionLabs/ci/...@v1`: the release job of ci moves `v1` to every 1.x release, and its
reusable workflows call their own actions at `@v1` too. `@main` reached every merge into ci, breaking or not; a SHA
pin was moved by nobody (Renovate left ci alone) and fell dozens of commits behind. With `@v1` fixes and features
arrive without a pull request, and a breaking change of ci becomes `v2`, which Renovate proposes (`pinDigests: false`
for `GravionLabs/ci`). The trust is the same as for the repository itself: the same organisation owns both.
Third-party actions stay pinned to a SHA.

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
