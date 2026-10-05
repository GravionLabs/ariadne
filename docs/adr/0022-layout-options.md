# ADR 0022: Layout options: four directions and spacing presets, in the file

- Status: accepted
- Date: 2026-10-05
- Issues: #108, #109, #113, #114, #115, #116
- Builds on: [ADR 0003](0003-auto-layout-commands-events.md)

## Context

Ariadne lays out every diagram itself (ADR 0003): nothing is placed by hand, so a file holds the graph only and a
diff shows what changed in the saga. Two directions (top-bottom, left-right) and one fixed spacing covered most
sagas, but a saga that reads better upward (a request that bubbles up) or right to left, or a big saga that needs
air, or a small one that should fit a slide, had no say. Manual placement, a ranker choice and a layout toolbar were
considered for #108 and dropped: they would make the picture depend on more than the graph.

## Decision

- **Two settings, stored in the diagram:** `direction` takes `top-bottom`, `bottom-top`, `left-right` or `right-left`;
  `spacing` takes `compact`, `normal` or `spacious`. They belong to the saga's picture like its name, so they are in
  the file, undone like an edit, and shared by the editor, the viewer and every export.
- **`normal` is not written,** so a file that does not choose stays byte for byte as it was (Determinism in the
  format spec).
- **An unknown value is not an error:** the reader draws the default and adds a note. A direction is about the
  picture, not the saga; refusing the file would be worse than drawing it another way. The JSON Schema still flags
  it, so the editor of the YAML points at a typo.
- **No new format version.** The values are additive: every file that does not use them reads the same in any
  Ariadne, and an older Ariadne reports one that does as invalid. A version 4 would have made every saved file
  unreadable to older installs, used or not.
- **One rule for direction:** a direction is an axis (vertical or horizontal) and a sense (`isHorizontal`,
  `isReversed` in `@ariadne/core`). A state is left on its downstream side and entered on its upstream side; the
  "+" of a transition label overhangs downstream, and `labelCard()` says where the card sits in the label's box.
  dagre gets `rankdir` `TB`, `BT`, `LR` or `RL`; the loops and lanes the layout routes itself, the SVG export, the
  editor's connectors, labels and "+" slots, Mermaid (`direction TB|BT|LR|RL`) and the viewer all follow the same
  rule.
- **Spacing presets** set dagre's `nodesep` and `ranksep` (`SPACING_GAPS`: compact 48 / 36, normal 80 / 60,
  spacious 128 / 96). Labels are dagre edge labels in their own rank, so a label and its "+" fit in every preset.
- **In the editor**, a **Layout** menu in the toolbox (its button shows the arrow of the direction) offers the
  directions and the spacings as radio items.

## Consequences

- `top-bottom` and `left-right` lay out and export exactly as before (the SVG snapshots did not change).
- A diagram that uses `bottom-top`, `right-left` or a spacing needs a version of Ariadne that knows them.
- The guide's "Source" example of a YAML error is a misspelt node type now, since a misspelt direction is no
  longer an error.
