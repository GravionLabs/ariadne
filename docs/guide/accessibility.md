# Accessibility

Ariadne aims to meet **WCAG 2.2 level AA** in the web editor, in the VS Code webview (the same editor), in the
`<ariadne-saga>` viewer and in the exports. This page says what is checked, what is not, and what is known not to
work. It does not claim conformance: the checks below find problems, they cannot prove there are none, and nobody has
yet recorded a test with a screen reader (see [what has been tested by people](#what-has-been-tested-by-people)).

_Last reviewed: 4 October 2026._

## What is checked on every change

These run in CI (`pnpm test`), so a change that breaks one does not merge.

- **axe-core** finds no serious or critical problem in the editor's views (the empty editor, a loaded saga, a
  selected state and transition, the source panel, the message catalog, the walkthrough, the path panel, the problems
  and export menus, and the new-diagram, import and generate dialogs), each in the light, dark and high-contrast
  theme, and in the viewer's panels in the light and dark theme. axe runs in jsdom, which has no layout, so it
  cannot judge colour contrast or the real size of anything.
- **Colour contrast of the themes** is checked on the colour tokens themselves: text at least 4.5:1 on every ground
  it is set on (WCAG 1.4.3), and the main colour, the focus ring, borders and the accent of every kind of state,
  message and node at least 3:1 on the cards (1.4.11), in the light, dark and high-contrast sets of the editor, in
  the colours of exported SVG, and in the viewer's dark colours.
- **Target size (2.5.8):** every control that has a size in the stylesheet is at least 24 × 24 px. A control that
  is as big as its text is not measured.
- **Dragging (2.5.7):** zoom and fit have buttons, and a connection can be made without dragging (the "+" buttons,
  and "To a new state" and "To an existing state" in the inspector).
- **Focus not obscured (2.4.11):** a state or transition selected with the keyboard is brought into view when the
  inspector, the panel on the left or the minimap covers it, or it is off the canvas.
- **Text alternatives of the exports (1.1.1):** an exported SVG has a title and a description and `role="img"`;
  Mermaid text has `accTitle` and `accDescr`; the Markdown page has tables with header rows; the picture in VS
  Code's Markdown preview has an `alt` text. See [Exports](exports.md#text-alternatives).

## Using Ariadne without a mouse

The editor is made to be used with the keyboard. The diagram is one tab stop; the arrow keys move between states
and transitions, `+`, `-` and `0` zoom, and the other controls are reached with `Tab`. [Keyboard shortcuts](shortcuts.md)
lists them. States and transitions have accessible names (for example "Decision: Check stock"), and the diagram
library announces the selection as it changes. The animated fit and centring are off when your system asks for
reduced motion. That every task can be done this way has not yet been tried by a person: that is what the
[manual test checklist](../specs/accessibility-checklist.md) is for.

## VS Code's high-contrast themes

In VS Code the editor takes its canvas colour, text colour, font and focus ring from the workbench, so it follows
whatever theme you chose, and VS Code's own contrast rules apply to them. The rest of the colours come from
Ariadne's own sets:

| VS Code theme       | Ariadne uses              |
| ------------------- | ------------------------- |
| Light, Dark         | the light, the dark set   |
| High Contrast       | the high-contrast set     |
| High Contrast Light | the light set (see below) |

## Known limitations

As of 4 October 2026:

- **No recorded test with a screen reader or in VS Code's high-contrast themes.** The steps are in the
  [manual test checklist](../specs/accessibility-checklist.md); its results table is empty.
- **No high-contrast light set.** VS Code's "High Contrast Light" theme gets the ordinary light set, whose
  contrast is checked as above but which is not a high-contrast design.
- **VS Code's own colours are not checked.** The canvas, text and focus ring in VS Code come from the workbench; the
  tests cannot see them.
- **Contrast is checked on tokens, not on the page.** A colour that is not a token (a colour a saga's author picks
  for a node, for instance) is not checked.
- **A PNG export has no text alternative.** Use the SVG or the Markdown page, or give the picture an `alt` text where
  you put it.
- **The YAML source panel** is a text editor (CodeMirror); its accessibility is CodeMirror's, which has not been
  tested here.
- **Mermaid is drawn by whoever renders it** (GitHub, a wiki). Ariadne supplies the title and description; what is
  drawn from them is not under its control.

## Report a problem

If something does not work for you, [open an issue](https://github.com/GravionLabs/ariadne/issues/new): say what you
were doing, what you use (browser, VS Code, screen reader, theme) and what you expected.
