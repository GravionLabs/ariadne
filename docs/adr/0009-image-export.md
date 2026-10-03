# 0009 — Image export renders SVG from the layout data

## Status

Accepted

## Context

Diagrams must be exportable as SVG and PNG for docs, wikis and slides. f-flow draws states as HTML
components, so capturing the DOM (`html-to-image`, `foreignObject`) gives fuzzy output and breaks on
fonts and CSS variables.

## Decision

- `renderDiagramSvg()` (`src/app/export/`) builds the SVG from `layoutDiagram()`, which already has
  the exact position and size of every state and transition label. Editor-only elements ("+" slots,
  selection) are not part of it.
- Colours are the light theme tokens written out as hex values, with tints pre-mixed: no CSS
  variables and no `color-mix`, so the file renders the same on GitHub, in browsers and in Inkscape.
- PNG is the SVG rasterised through `<canvas>` (2× by default, white or transparent background).
- Files are saved through `FileStorage.exportFile()`, so the web build downloads and the Tauri shell
  can use a native dialog.

## Consequences

- The renderer repeats the card metrics of the node and label components; they are kept in step by
  the shared constants in `diagram-layout.ts` and by a snapshot test of the order saga.
- Unfolded descriptions are not exported; the export shows the folded diagram.
- Compensation transitions are routed along a lane beside the graph, as they are not part of the
  layout.
