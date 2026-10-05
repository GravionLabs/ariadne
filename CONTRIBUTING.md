# Contributing to Ariadne

Ariadne is a saga diagram editor (Angular + Foblex f-flow), a VS Code extension and a command line,
all working on `*.saga.yaml` files. It documents sagas; it never runs them. [`AGENTS.md`](AGENTS.md)
is the short version of the rules below, for coding agents.

## Setup

You need Node.js (the major version in [`.nvmrc`](.nvmrc)) and pnpm, which corepack provides at the
version pinned in `package.json` (`packageManager`):

```sh
corepack enable
pnpm install
```

Or open the repository in the [dev container](.devcontainer/README.md) (VS Code or GitHub
Codespaces), which has all of this, the .NET SDK and xvfb, like CI.

**pnpm only. Never npm or yarn.** There is one lockfile (`pnpm-lock.yaml`), and the install scripts
of dependencies are allowed one by one in `allowBuilds` in `pnpm-workspace.yaml`; another package
manager would ignore both.

## The workspace

```
apps/       web (the Angular editor), server, cli, vscode, viewer-demo
packages/   core, export, masstransit, editor-protocol, viewer
```

The [README](README.md#project-layout) describes each of them. The rules that keep it healthy
([ADR 0006](docs/adr/0006-typescript-monorepo.md)):

- packages never import from `apps/`;
- `@ariadne/core` has no framework dependency;
- native features (opening and saving files) go behind the `FileStorage` interface, so the web
  build works without Tauri or VS Code.

## Scripts

Run these from the root; they run across the workspace.

| Command       | What it does                                   |
| ------------- | ---------------------------------------------- |
| `pnpm build`  | builds every package and app                   |
| `pnpm test`   | unit tests of every package and app            |
| `pnpm lint`   | ESLint                                         |
| `pnpm format` | Prettier, fixing files (`format:check` checks) |
| `pnpm start`  | the web app on http://localhost:4200           |

One package: `pnpm --filter <name> <script>`, e.g. `pnpm --filter @ariadne/core test`.

## Running each app

- **Web:** `pnpm start`, then open `docs/examples/order.saga.yaml` with **Open…**.
- **Server and container:** `pnpm --filter @ariadne/web build` and `pnpm --filter @ariadne/server build`,
  then `ARIADNE_ROOT=$PWD/apps/web/dist/ariadne/browser node apps/server/dist/server.mjs` from the
  root (port 8080; `ARIADNE_ROOT` is the folder of the built app).
  `docker compose up` runs the published image; see [docs/self-hosting.md](docs/self-hosting.md)
  and [ADR 0014](docs/adr/0014-server-and-container.md).
- **CLI:** `pnpm --filter @ariadne/cli build`, then `node apps/cli/dist/ariadne.mjs --help`.
- **VS Code extension:** see [`apps/vscode/DEVELOPING.md`](apps/vscode/DEVELOPING.md).
- **The viewer and its demos:** see [`packages/viewer/README.md`](packages/viewer/README.md).

## Tests

Every change comes with tests, and the suite is green before every commit.

- **Unit tests:** Vitest in the packages, the server, the CLI and the extension; the Angular apps
  (`apps/web`, `apps/viewer-demo`) run `ng test`. `pnpm test` runs them all.
- **VS Code integration tests:** `pnpm --filter ariadne-vscode test:integration` opens a real VS
  Code; on Linux without a display use `test:integration:ci` (xvfb). Tests wait for conditions,
  never for time; see "Flaky tests" in `apps/vscode/DEVELOPING.md`.
- **Viewer package test:** `pnpm --filter @ariadne/viewer test:package` packs the viewer and uses it
  from a clean project.
- **Generated C# compiles:** `pnpm --filter @ariadne/cli build && scripts/compile-generated.sh`
  needs the .NET 8 SDK (the `generated-csharp` job in
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs it; you only need it when you change
  the generator).

## The images of the user guide

The screenshots and GIFs in `docs/images/guide` are made by a script, so that they stay current when the
interface changes. After a change that shows (a button, a panel, a colour), re-capture them and commit the ones
that changed:

```sh
pnpm --filter @ariadne/web capture:install   # once: Chromium (needs sudo for its system libraries)
sudo apt-get install -y ffmpeg fonts-dejavu  # once, for GIFs and the one font every picture uses
pnpm --filter @ariadne/web capture           # builds the app, serves it, writes docs/images/guide
```

The captures are in `apps/web/capture` (`*.capture.ts`, one test for each image, named after it), with their
helpers in `helpers.ts`. A capture that cannot find something the interface no longer has fails: that is the
signal that the guide needs a look. They are not part of `pnpm test`.

## Work tracking

Work is tracked in GitHub issues as **Epic → Feature → PBI → Task** (a **Bug** has Tasks), linked as
native **sub-issues**, not markdown checklists. Closing a child updates its parent. The templates
come from `GravionLabs/.github`. Start from an issue; if there is none, open one.

The title of an issue starts with its level: `[Epic]`, `[Feature]`, `[PBI]`, `[Task]` or `[Bug]`, then the
summary (`[PBI] feat: short summary`). The `Issue title` workflow checks it when an issue is opened or edited.
Every issue and pull request is also an item of the project board; set its **Level** there too.

## Branches and commits

- Branches: `feature/<issue>-<slug>` (and `fix/<slug>` for fixes).
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `docs`, `test`,
  `refactor`, `chore`, `ci`, `perf`) that reference the issue: `feat: short summary (#123)`.
- One logical change per commit, with green tests.
- Pull requests are squash-merged and the PR title is kept, which becomes the release note
  ([ADR 0015](docs/adr/0015-versioning-and-releases.md)). Put `Closes #<issue>` in the PR body.
- Every PR targets `main`; do not stack PRs on other feature branches. A PR merged into a branch
  that is then squash-merged is lost (this happened to #332 and #336). Wait for the parent to merge,
  then open the next PR from `main`. The `PR base` check fails otherwise.

## ADRs

An architectural change gets an ADR in `docs/adr/NNNN-title.md`, in the format of the existing ones
(status, date, issues, context, decision, consequences). Examples of what counts: a new package, a
new dependency that shapes the code, a change to the file format or to a protocol.

## Code style

Prettier and ESLint run in CI (`pnpm format:check`, `pnpm lint`). Beyond that, write code that
reads like the code around it: same naming, same comment density, same idioms.

## Dependencies

A new dependency is a review item. If a package has an install script, it is added to `allowBuilds`
in `pnpm-workspace.yaml` as `true` or `false` with a comment on why, and the reviewer checks that
the script is needed.
