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

## Addendum: the WCAG 2.2 AA audit (#278, 2026-10-04)

Point 6 said that contrast is "checked by hand". It is now checked by tests, and what they found is
fixed:

- **Contrast of the tokens** (`theme-contrast.spec.ts`; `svg.spec.ts` for the export's `COLORS`;
  `styles.spec.ts` for the viewer's `DARK`): text 4.5:1 on every ground (1.4.3); the main colour, the
  focus ring, the muted border, and every state, message and node accent 3:1 on the card (1.4.11).
  The dark and high-contrast sets and the viewer's dark colours already passed. The light set did not:
  eleven pairs. Each failing colour was darkened as little as possible, keeping its hue and
  saturation, and the same value is used in the export and the viewer (their fallbacks):

  | Token (light)                                                    | Before    | After     |
  | ---------------------------------------------------------------- | --------- | --------- |
  | `--c-border-muted` (export: `line`)                              | `#b0b5c3` | `#868ea3` |
  | `--c-text-subtle` (export: `textSubtle`; viewer fallback)        | `#6b7086` | `#676c81` |
  | `--c-primary` (white text on it is 4.5:1)                        | `#6366f1` | `#6265f1` |
  | `--c-start`, `--c-node-green` (export: `start`, `palette.green`) | `#22c55e` | `#1dab52` |
  | `--c-compensation` (export: `compensation`)                      | `#f59e0b` | `#ce8408` |
  | `--c-node-orange` (export: `palette.orange`)                     | `#f97316` | `#f76906` |
  | `--c-node-amber` (export: `palette.amber`)                       | `#eab308` | `#ba8e06` |
  | `--c-node-teal` (export: `palette.teal`)                         | `#14b8a6` | `#12a796` |

  The Mermaid export keeps its own colours: GitHub draws them, not Ariadne.

- **Axe in every view and theme** (`a11y.spec.ts`: the empty editor, the sample, selections, the
  source, catalog, walkthrough and path panels, the menus and the dialogs, each in the light, dark and
  high-contrast theme; the viewer's panels in light and dark). The one finding was the export menu: a
  `role="menu"` may only hold menu items and groups, so its sections are `role="group"` now.
- **2.5.8 target size:** one control declared less than 24 px, the "Show description" toggle of a state
  card (22 px). It is 24 px.
- **2.4.11 focus not obscured, and 2.5.7 dragging:** the keyboard layer of f-flow already moves the
  selection with the focus, and zoom, fit and every connection have a button or a key, but the canvas
  did not follow the selection, so a state could be behind the inspector, the panel on the left, the
  minimap, or off screen. A lone selected state or transition is now centred when it is covered or
  outside the canvas. Arrow keys are not used to pan: f-flow uses them to move between states.
- Not checked by tests: VS Code's own colours (`:root[data-host='vscode']`), which only exist inside
  VS Code, and everything that needs a screen reader or a person. That is the manual checklist in
  `docs/specs/accessibility-checklist.md`.
