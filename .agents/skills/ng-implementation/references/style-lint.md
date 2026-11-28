# Style lint: tokens only

Angular repositories enforce the tokens of `docs/STYLEGUIDE.md` (skill `ui-styleguide`) with Stylelint. Not ast-grep: Stylelint understands CSS and SCSS.

## Which procedure

- `package.json` depends on `@gravionlabs/helix-ui` → only [Helix projects](#helix-projects).
- Every other project → the sections from [Install](#install) to [Token file](#token-file).

## Helix projects

The preset is the package `@gravionlabs/helix-lint` ([docs](https://github.com/GravionLabs/helix/blob/main/docs/LINT.md), ADR 0009 of GravionLabs/helix). Do not copy the `setup-oxc-husky` template; its token rules would override the preset.

```powershell
pnpm add -D @gravionlabs/helix-lint stylelint stylelint-config-standard-scss eslint @angular-eslint/template-parser
```

Versions up to 22.9.1 are empty placeholders that report nothing: install a newer one, and see a hex color and a raw `<select>` fail before you trust the run.

| Config                               | Import                              | Checks                                                                                      |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `stylelint.config.mjs`               | `@gravionlabs/helix-lint/stylelint` | no hex, no `rgb()`/`hsl()`, `font-size` from `--h-font-size-*`, a keyword or `calc`/`clamp` |
| `eslint.config.mjs` (template check) | `@gravionlabs/helix-lint/eslint`    | `helix/no-raw-control` in `**/*.html`                                                       |

```js
// stylelint.config.mjs
export default {
  extends: ['stylelint-config-standard-scss', '@gravionlabs/helix-lint/stylelint'],
  ignoreFiles: ['dist/**'],
};
```

```js
// eslint.config.mjs
import helix from '@gravionlabs/helix-lint/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig({ ignores: ['dist/**'] }, helix);
```

- Existing configs (`setup-oxc-husky`): add the preset to them and keep their other rules. In `stylelint.config.mjs` remove `color-no-hex`, `function-disallowed-list`, `declaration-property-value-allowed-list` and the token-file override; in `eslint.config.mjs` add `helix` to the config list.
- Exceptions, token files with raw values included: `helixAllow({ files, rules, reason })`, exported by both imports. Stylelint: an entry of `overrides`; ESLint: a config object after `helix`. It throws without one of the three.
- `pnpm lint` runs both commands, `stylelint "**/*.{css,scss}"` and `eslint "**/*.html"` (`setup-oxc-husky` already runs the second one and `lint:styles`; give `lint:styles` this glob).
- Add both as fast checks to `.agents/config.json`:

```json
{
  "checks": [
    {
      "name": "stylelint",
      "command": "npx --no-install stylelint \"**/*.{css,scss}\"",
      "fast": true
    },
    {
      "name": "template-check",
      "command": "npx --no-install eslint \"**/*.html\"",
      "fast": true
    }
  ]
}
```

## Install

`setup-oxc-husky` installs `stylelint` and `stylelint-config-standard-scss`, copies its `templates/stylelint.config.mjs` to the repository root (the single source of the config, with the token rules) and adds `lint:styles` and the `lint-staged` entry (ADR 0008). By hand:

```powershell
pnpm add -D stylelint stylelint-config-standard-scss
```

Copy `stylelint.config.mjs` from the `setup-oxc-husky` templates. It uses `postcss-scss` (a dependency of `stylelint-config-standard-scss`), so `.css` and `.scss` files are read.

## Rules

- `color-no-hex`: no `#fff`.
- `function-disallowed-list`: no `rgb()`, `rgba()`, `hsl()`, `hsla()`; colors only as `var(--…)`.
- `declaration-property-value-allowed-list`: `font-size` is a token (`var(--…)`) or a step of the scale; adapt the `rem` list in the template to the scale of the guide.

Every message names the reason and `docs/STYLEGUIDE.md`.

## Gate

Add a fast check to `.agents/config.json`:

```json
{
  "checks": [
    {
      "name": "stylelint",
      "command": "npx --no-install stylelint \"src/**/*.{css,scss}\"",
      "fast": true
    }
  ]
}
```

## Token file

The token definitions may use raw values. The `overrides` entry of the config switches the three rules off for `tokens.css`, `tokens.scss`, `_tokens.scss` and `styles/tokens/`; change its `files` list to where the repository defines its tokens. Allow nothing else: a one-off value elsewhere is a new token in the guide.
