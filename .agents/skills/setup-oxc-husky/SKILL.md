---
name: setup-oxc-husky
description: 'Set up oxlint, oxfmt, Husky pre-commit with lint-staged and format-on-save for a TS, Node or Angular project (ESLint for Angular templates only). Use when asked to add or migrate linting, formatting or pre-commit hooks.'
disable-model-invocation: true
metadata:
  opencode/autoinvoke: 'false'
---

Set up oxlint and oxfmt with Husky for a plain TypeScript, Node.js or Angular project. Paths to `scripts/` and `templates/` are relative to this skill's directory. Decision and pilot results: ADR 0006 of GravionLabs/skills.

## Stack

- **oxfmt** (`.oxfmtrc.json`): formats `*.ts`, `*.js`, `*.json`, `*.md`, `*.yml`, `*.yaml`, `*.css`, `*.scss`, Angular templates (`associations` with `angular-html`)
- **oxlint** (`.oxlintrc.json`): correctness rules plus a fixed rule set, type-aware (`options.typeAware`, needs `oxlint-tsgolint`); Angular loads `@angular-eslint/eslint-plugin` as a JS plugin
- **ESLint** (Angular only, `eslint.config.mjs`): `**/*.html` only, `templateRecommended` + `templateAccessibility`; oxlint cannot parse templates
- **Lint probe** (Angular only, `lint-probe/`): a component and a template that break 8 known rules; `node lint-probe/check.mjs` (part of `lint`) fails when oxlint or ESLint stops reporting one
- **Stylelint** (`stylelint.config.mjs`, `stylelint-config-standard-scss`; Angular always, plain TS with `-Stylelint`; ADR 0008): lints `*.css`, `*.scss` (`lint:styles`, part of `lint`); oxfmt formats them
- **Husky** + **lint-staged** running `oxlint --fix` and `oxfmt` (Angular: `eslint --fix` on `*.html`; Stylelint: `stylelint --fix`, then `oxfmt` on `*.{css,scss}`) on staged files

oxlint, oxfmt and oxlint-tsgolint are pinned to exact versions (`$Versions` in the script): JS plugins are alpha, and an update must pass the probe.

## Steps

1. Ask: IDE (VS Code / WebStorm / both / none); for Angular the selector prefix (default `app`).
2. Show the plan: `pwsh scripts/Setup-Oxc.ps1 -WhatIf` (variant, packages, files created or kept, scripts, lint-staged, previous tools found).
3. Run it:

   ```powershell
   pwsh scripts/Setup-Oxc.ps1 [-ProjectType auto|ts|angular] [-SelectorPrefix app] [-Stylelint] [-IDE vscode]
   ```

   It installs the packages with pnpm or npm (detected from the lockfile / `packageManager` field) at exact versions, copies the configs unless they exist, initializes Husky, adds `lint-staged` and the `lint`, `lint:fix`, `format`, `format:check` scripts (existing scripts are kept and reported), and writes the IDE settings (VS Code: `oxc.oxc-vscode`).

4. Migrating a project: see `## Migration`.
5. Format the project once: `npx oxfmt`; commit that alone and put its hash into `.git-blame-ignore-revs`.
6. Verify: `pnpm lint` and `pnpm format:check` (npm: `npm run …`).

## Migration

- **From Biome: CSS rules move to Stylelint** (`declaration-block-no-duplicate-properties`, `selector-pseudo-element-no-unknown` with `ng-deep` allowed are in the template); run the script with `-Stylelint` in a plain TS project.
- **From Biome**: no migration tool for lint rules; map the rules of `biome.json` by hand (`useNodejsImportProtocol` → `unicorn/prefer-node-protocol`, `noExplicitAny` → `typescript/no-explicit-any`, `noNonNullAssertion` → `typescript/no-non-null-assertion`, `useTemplate` → `prefer-template`, `useImportType` → `typescript/consistent-type-imports`, `noFocusedTests` → `vitest/no-focused-tests`). `npx oxfmt --migrate=biome` keeps the format options but drops the `files.includes` allowlist: add ignore patterns for templates, fixtures and generated files.
- **From Prettier**: `npx oxfmt --migrate=prettier` (keeps the Angular parser override as `associations`).
- **From ESLint**: `npx @oxlint/migrate` converts the TypeScript rules; list the skipped ones in the PR. Angular: move inline `template:` to `.html` files first (`component-max-inline-declarations` with `template: 0` then keeps them out), and drop `processInlineTemplates`.
- Remove the old tool, its config, ignore file, plugins and editor settings in the same change; never two formatters on the same files.

## Templates

| File                               | Purpose                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.oxfmtrc.json.template`           | Width 100, 2 spaces, single quotes, semicolons, trailing commas `all`, LF; lockfiles and `CHANGELOG.md` ignored                       |
| `plain-ts/.oxlintrc.json.template` | typescript, unicorn, oxc, node, vitest plugins; correctness as errors; type-aware                                                     |
| `angular/.oxlintrc.json.template`  | As plain TS plus `@angular-eslint/eslint-plugin` (selector prefix, outputs, lifecycle, standalone, no inline templates outside specs) |
| `angular/eslint.config.mjs`        | Template rules and accessibility rules on `**/*.html`                                                                                 |
| `angular/lint-probe/`              | `probe.ts`, `probe.html` and `check.mjs` (the regression check of the JS plugin and the template rules)                               |
| `stylelint.config.mjs`             | Stylelint: standard-scss, former Biome CSS rules, token rules of `ng-implementation` `references/style-lint.md` (single source)       |
| `.husky/pre-commit`                | Runs `npx lint-staged` on commit                                                                                                      |

## Constraints

- Existing configs are kept, not overwritten; existing `lint-staged` and scripts are kept and reported
- Raise the oxc versions together and only with a green probe; each version must be older than the release-age delay
- `detect-techstack` reports `oxlint` / `oxfmt` once the configs exist; `implementation` then formats with oxfmt and lints with oxlint (`Format-Changed.ps1`)

Report: summary, files created or changed, verify commands.
