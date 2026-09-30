# Ariadne — Agent Instructions

Saga/flow diagram editor: Angular + Foblex f-flow, optional Tauri 2 desktop shell, diagrams stored as local YAML files. Documentation only (no execution).

- **Package manager: pnpm only.** Never npm/yarn.
- Native features (file open/save) go behind a `FileStorage` interface; the web build must work without Tauri.
- Work is tracked as Epic → Feature → PBI → Task (Bug → Task) using GitHub **native sub-issues**, not markdown checklists. Issue templates are inherited from `GravionLabs/.github`.
- Add/update an ADR in `docs/adr/` for architectural changes.
