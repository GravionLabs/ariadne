# ADR 0002: YAML diagram files behind a FileStorage abstraction

- Status: accepted
- Date: 2026-10-01
- Issues: #20, #23, #26

## Context

Diagrams are documentation that lives next to the code they describe, so they should be plain files that
diff well in git. The same editor runs as a web app (no native file access, some browsers lack the
File System Access API) and later inside a Tauri 2 shell (native dialogs and file system).

## Decision

1. **One YAML file per diagram**, versioned with a top-level `version` field. The schema is in
   [`docs/specs/diagram-format.md`](../specs/diagram-format.md). (De)serialization is a pure module
   (`src/app/model/diagram-yaml.ts`, using the `yaml` package) with deterministic output: fixed key order,
   model element order, rounded positions, no line wrapping. Parsing validates the whole file and fails
   with a path-specific `DiagramFormatError` instead of loading partial data.
2. **`FileStorage` abstract class** (`src/app/storage/file-storage.ts`) with `open()`, `save(content, ref)`
   and `saveAs(content, suggestedName)`. It deals only in strings and opaque `FileRef`s, and returns
   `null` when a dialog is cancelled. It is used as the DI token, and `app.config.ts` binds the platform
   implementation.
3. **`BrowserFileStorage`** uses the File System Access API where available, so Save writes in place.
   Elsewhere it falls back to a file input for opening and a download for every save.
4. **`DiagramDocument`** service owns the current file reference and an unsaved-changes flag. Because
   `DiagramStore` is immutable, "dirty" is simply `store.diagram() !== lastSavedDiagram`, which also
   becomes clean again when undo returns to the saved state.

## Consequences

- The web build works without Tauri. The Tauri shell (#39/#40) only has to provide another
  `FileStorage` implementation and bind it at bootstrap.
- In browsers without the File System Access API (Firefox, Safari), "Save" downloads a new copy each
  time instead of overwriting the opened file.
- Format changes require bumping `version` and adding a migration in the parser.
