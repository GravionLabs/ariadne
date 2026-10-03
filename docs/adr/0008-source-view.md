# ADR 0008: A source view next to the diagram

- Status: accepted
- Date: 2026-10-03
- Issues: #205, #206, #210

## Context

A diagram is a small YAML file. Some changes are quicker as text (renaming, copying a state,
bulk edits), reviewers want to see what will land in git, and the file format is easier to learn when
it is next to the picture. The web app should offer that without becoming a second, separate
representation of the saga.

## Decision

1. **A split view, not tabs.** The "Source" button opens a panel to the right of the canvas, resizable
   with the mouse or the keyboard. Open state and width are remembered (`localStorage`, guarded).
   Tabs would hide the picture while editing text, which defeats "quickly see the result".
2. **The panel edits the file format itself.** What it shows is what Save writes
   (`serializeDiagram`); there is no second representation.
3. **Two-way sync in `SourceSync`** (lives only while the panel is open):
   - diagram → text on every change: canvas, inspector, undo/redo, opening a file;
   - text → diagram after a 300 ms pause, or when the editor loses focus, as **one undo step**
     (`DiagramStore.replace`, a no-op for text that only differs in formatting);
   - **invalid text never replaces the diagram and never rewrites the text**: the diagram keeps its
     last valid state and the status line says so;
   - the diagram that came from the text is remembered, so what the user types is not reformatted
     while they type, and undoing back to that very diagram still updates the text.
4. **Errors have positions.** YAML syntax errors use the parser's position; format errors such as
   `nodes[2].type must be one of …` are looked up by path in the parsed document
   (`locateSourceError`). The status line shows `Line:column`, the editor underlines the problem and
   marks the gutter.
5. **CodeMirror 6, loaded on demand.** YAML highlighting, line numbers, history and search come from
   CodeMirror. It is a lazy chunk (about 360 kB, 100 kB transferred) fetched when the panel is first
   opened, so the initial bundle is unchanged. The editor sits behind a small `CodeEditor` interface,
   so specs run against a fake and the library can be swapped.
6. **Shortcuts.** Ctrl+Z / Ctrl+Y stay with the focused text field's own history. Ctrl+S and Ctrl+O
   work from inside text fields: the field is left first, so a pending edit is applied before saving.

## Consequences

- Text and picture can be edited interchangeably, and every applied text edit can be undone from the
  canvas toolbar.
- A pasted older file version is migrated and gets the same notice as opening it.
- Text typed while the diagram changes underneath it (undo in the canvas, opening a file) is replaced
  by the new diagram: the diagram wins, since it was changed last.
- The VS Code extension (#178) does not get this panel. VS Code is already a text editor for the same
  file ("Open to the Side", Problems panel), and the embedded build hides the panel.
- The panel colours come from the app's CSS tokens, so the dark theme (#152) applies to it too.
