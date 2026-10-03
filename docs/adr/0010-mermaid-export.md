# 0010 — Mermaid export as `stateDiagram-v2`

## Status

Accepted

## Context

Sagas are state machines, so Mermaid's `stateDiagram-v2` maps almost one to one to the model, and
GitHub renders it in READMEs and wikis.

## Decision

`diagramToMermaid()` (`src/app/export/diagram-mermaid.ts`) writes:

- `direction TB` / `LR` from the diagram.
- The initial state as `[*] --> First`.
- **Final states as named states followed by `--> [*]`.** An alias pointing to `[*]` would render as
  the bare end marker and lose the name.
- **Decisions as plain states** with several transitions. `<<choice>>` renders as an unlabelled
  diamond, which hides the name and the activities.
- Ids: the name with every character other than letters, digits and `_` replaced by `_`, unique
  case-insensitively and never a Mermaid keyword. Names that differ from their id are declared
  `state "Name" as id`.
- Transition labels `Event / Send A, Publish B`: the activities are those of the target state, as
  they run on entering it. Events from outside are marked `(from Shop API)`.
- Compensation transitions are labelled `compensate: …`; states that have a compensation are in the
  `compensation` class (amber, as in the editor).
- `"` and `;` in names and labels become `#quot;` and `#59;`.

The top bar copies the text to the clipboard or saves it as `.mmd` or `.md` (a fenced block), through
`FileStorage.exportFile()`.

## Consequences

- Mermaid has no styling for individual transitions, so the compensation marker is the label text.
- Output is checked in a snapshot test and was parsed with Mermaid's own parser.
