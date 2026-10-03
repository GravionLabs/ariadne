# ADR 0009: Themes and accessibility

- Status: accepted
- Date: 2026-10-03
- Issues: #152, #153, #154, #155, #156

## Context

The editor is used in the browser and is meant to be embedded in a VS Code webview, whose
light, dark and high-contrast themes it has to match. It must also work without a mouse and with
a screen reader.

## Decision

1. **Colours are tokens** in `src/styles.scss`. The dark and high-contrast sets are mixins applied
   under `:root[data-theme='…']`; the dark set also applies under `prefers-color-scheme: dark` while
   no `data-theme` is set.
2. **`Theme` service** (`src/app/theme.ts`) sets `data-theme`. Order of precedence: the host (via
   `Theme.setHost` or `postMessage({ type: 'ariadne:theme', kind })`), the user's toggle (remembered in
   `localStorage`, guarded), the system setting. VS Code's "high-contrast light" falls back to light:
   there is no light high-contrast set yet.
3. **Contrast**: text and accent tokens in the dark set measure at least 6:1 on the surfaces; the
   outline of states and connections at least 3:1. Component styles use tokens only (`--c-on-primary`,
   `--c-warning`), no literal colours.
4. **Keyboard and screen readers** rely on f-flow's `withA11y()` layer (one tab stop on the diagram;
   arrows, `Ctrl`+arrows, `Home`/`End`, `Ctrl+A`, `Esc`, `Delete`, `+`/`-`/`0`), which also announces
   selection through a live region. Ariadne adds names (`Decision: Check stock`, `Transition from A to
B on E`) and a visible focus ring on the flow. Documented in the README.
5. **`prefers-reduced-motion`** turns off the animated fit and centring.
6. **axe-core** runs in the editor specs (jsdom) and fails on serious or critical findings. jsdom has
   no layout, so the colour-contrast rule is off there; contrast is checked by hand (3).

## Consequences

- A new colour needs a token with a dark value.
- A host other than VS Code uses the same message to drive the theme.
