---
name: ng-implementation
description: 'Angular 21+ implementation and review rules (standalone, signals, DI, forms). Use when writing or changing Angular code.'
license: MIT
---

Paths to `references/` are relative to this skill's directory.

## Before writing code

- Run `ng version` first; conventions differ between majors. If it fails, use `npx @angular/cli@latest`.
- Generate with `ng generate`, then `ng build` immediately and fix errors before continuing.
- Do not guess APIs: use the Angular CLI MCP server or angular.dev. If the MCP server is not configured → read `references/mcp.md`.
- If working with Signal Forms, Angular Aria, `linkedSignal`/`resource`, functional route guards or Vitest setup → read `references/version-notes.md`.

The official `angular-developer` skill (dependency `angular/skills`) covers the basics: standalone components, signals, OnPush, control flow, DI, forms. Only project conventions follow.

## Conventions

- Standalone components only, no NgModules; do not add `standalone: true` (it is the default)
- Forms: Reactive Forms by default; Signal Forms (`@angular/forms/signals`) only when requested or already used in the codebase
- Subscriptions cleaned up via `DestroyRef` / `takeUntilDestroyed`
- Upgrades: one major at a time with `ng update`; `ng generate @angular/core:control-flow` migrates legacy templates
- Styles: plain CSS (`.css` files, `inlineStyleLanguage` and the schematic `style` are `css`; nesting is native, tokens are custom properties). SCSS is the exception: one file that needs a Sass feature CSS lacks (`meta.load-css`), with the reason in a comment at its top; never for nesting, variables or a mixin alone. Under a selector list write nested rules out (native nesting wraps the list in `:is()` and changes the specificity)
- Formatting and lint: oxfmt + oxlint with `@angular-eslint/eslint-plugin` as a JS plugin, ESLint only for `.html` templates (`setup-oxc-husky`, ADR 0006 of GravionLabs/skills); projects not yet migrated keep Prettier + angular-eslint; never Biome
- Templates live in `.html` files (`templateUrl`); no inline `template:` outside spec files, so ESLint never reads `.ts`

## File naming

Match the project's existing convention. New Angular 20+ projects follow the CLI default: no `.component` / `.service` suffix (`header.ts`, class `Header`); projects that still use `*.component.ts` keep it. Never mix both in one project.

## Libraries

- `ng generate library <name> --prefix=<prefix>` inside the workspace
- `public-api.ts` is the single export surface; no deep imports
- `ng-package.json`: `lib.entryFile` points to `public-api.ts`
- Verify with `ng build <lib>` before the task is complete

## Format

- Extensions: prettier `.ts .tsx .js .mjs .cjs .json .html .scss .css`; eslint only `.ts .tsx .js .mjs .cjs`
- Format: `npx --no-install prettier --write {files}` then `npx --no-install eslint --fix {files}`
- Check (read-only): `npx --no-install prettier --check {files}` and `npx --no-install eslint {files}`
- Biome project (`biome.json[c]`): `npx biome check --write --no-errors-on-unmatched {files}` / check `npx biome check --no-errors-on-unmatched {files}`
- oxc project (`.oxfmtrc.json[c]` / `.oxlintrc.json`): `npx --no-install oxfmt --no-error-on-unmatched-pattern {files}`, `npx --no-install oxlint --fix --no-error-on-unmatched-pattern {files}`, then `npx --no-install eslint --fix {files}` on `.html` only / check `npx --no-install oxfmt --check --no-error-on-unmatched-pattern {files}`, `npx --no-install oxlint --no-error-on-unmatched-pattern {files}` and `npx --no-install eslint {files}`; oxfmt also formats `.md .yml .yaml`
- Run after green tests, before the commit: `pwsh <implementation dir>/scripts/Format-Changed.ps1 -Language ng` (`-Check` for the check commands; not-configured, override: references/format.md of `implementation`)

## Tests

Load `ng-test` for TestBed setup, signal testing, mocking and async patterns.

## Gate

Run `pnpm check:changed` once when the work is done (the gate of this stack; `implementation` runs it through `Invoke-Gate.ps1`): `../../shared/implementation/references/gate.md`.

## Review rules

- 🔴 Lint run (`Format-Changed.ps1 -Lint -Language ng`, oxlint + ESLint on `.html`, or ESLint) exits non-zero: error-level findings; 🟡 warning-level findings
- `OnPush`; signals for state, `computed()` for derived values
- `effect()` only for side effects, never for state updates (use `computed` or `linkedSignal`)
- `@if` / `@for` (with `track`) / `@switch`; `input()` / `output()`
- `inject()`; no constructor injection in new code
- Subscriptions cleaned up via `DestroyRef` / `takeUntilDestroyed`
- No complex template expressions; ARIA labels and `alt` text on interactive elements and images
- Library code exported only through `public-api.ts`
- New or changed behavior has tests per `ng-test`

## Scaffolding

- New standalone component → read `references/component.md`
- New NgRx Signal Store for feature state → read `references/signal-store.md`
- Enforce style tokens (no raw colors or font sizes) with Stylelint → read `references/style-lint.md`

## Related Skills

- `ng-ag-grid` — AG Grid Enterprise integration
- `ng-create-project` — new application or workspace
