# Ariadne — Agent Instructions

Saga/flow diagram editor: Angular + Foblex f-flow, optional Tauri 2 desktop shell, diagrams stored as local YAML files. Documentation only (no execution).

- **Package manager: pnpm only.** Never npm/yarn.
- pnpm workspace: the Angular app is `apps/web`, shared libraries go to `packages/*` (see `docs/adr/0006-typescript-monorepo.md`). Run `build`, `test`, `lint` and `format` from the root; packages never import from `apps/`, and `@ariadne/core` has no framework dependency.
- Native features (file open/save) go behind a `FileStorage` interface; the web build must work without Tauri.
- Work is tracked as Epic → Feature → PBI → Task (Bug → Task) using GitHub **native sub-issues**, not markdown checklists. Issue templates are inherited from `GravionLabs/.github`.
- Add/update an ADR in `docs/adr/` for architectural changes. The `PR checks` workflow asks for one when a pull request changes a path of `governance.adrPaths` in `.agents/config.json` (the workspace, the container, the file format schema) or closes an issue labelled `needs-decision`; the label `skip-adr` skips it. A new ADR takes the next free number and a `Status:` line.
- **Work goes into `release/next`, never straight into `main`.** Cut the branch `<type>/<nr>-<slug>` from `release/next` and open the PR into `release/next` (squash; the PR title is the commit and a Conventional Commit; `Closes #<nr>` in the body). `main` is released code: every push to it is a release, and it only receives the release PR from `release/next` (merge commit, merged by a person) or a hotfix. See `docs/adr/0027-release-branch.md`.
- Never stack a PR on another feature branch: it is lost when the parent is squash-merged (#332, #336). The `PR base` workflow enforces a base of `main` or `release/*`.

## Verify

Run these from the root before a commit; all of them must pass before a pull request.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm format:check
```

`pnpm format` fixes the formatting. One package only: `pnpm --filter <name> test` (e.g. `@ariadne/core`, `@ariadne/web`, `ariadne-vscode`).
