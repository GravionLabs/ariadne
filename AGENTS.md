# Ariadne — Agent Instructions

Saga/flow diagram editor: Angular + Foblex f-flow, optional Tauri 2 desktop shell, diagrams stored as local YAML files. Documentation only (no execution).

- **Package manager: pnpm only.** Never npm/yarn.
- pnpm workspace: the Angular app is `apps/web`, shared libraries go to `packages/*` (see `docs/adr/0006-typescript-monorepo.md`). Run `build`, `test`, `lint` and `format` from the root; packages never import from `apps/`, and `@ariadne/core` has no framework dependency.
- Native features (file open/save) go behind a `FileStorage` interface; the web build must work without Tauri.
- Work is tracked as Epic → Feature → PBI → Task (Bug → Task) using GitHub **native sub-issues**, not markdown checklists. Issue templates are inherited from `GravionLabs/.github`.
- Add/update an ADR in `docs/adr/` for architectural changes.
- **Every PR targets `main`.** Never stack a PR on another feature branch: it is lost when the parent is squash-merged (#332, #336). Branch from `main`; the `PR base` workflow enforces it.
