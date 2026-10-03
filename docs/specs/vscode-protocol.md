# VS Code webview protocol (version 1)

The Ariadne extension (`apps/vscode`) shows a `*.saga.yaml` in the Angular editor, inside a VS Code
webview. The two sides talk with `postMessage`. The types and the readers that check incoming
messages are in `@ariadne/editor-protocol`; both sides use that package, so there is one definition.

## Rules

- Every message is a plain object `{ v: 1, type: '…', … }`. `v` is the protocol version.
- A receiver ignores what it does not understand: a missing or different `v`, an unknown `type`, a
  field of the wrong type. Nothing in the protocol throws.
- The document is always the whole text. The editor never sends a patch.
- **The text is the source of truth.** The document is a normal VS Code `TextDocument`; the editor
  shows what the host sends and offers changes back. The editor writes with `serializeDiagram()`, so
  the same diagram always gives the same text and a diff only shows real changes.

## Host → editor

| `type`            | Fields                      | When                                                                                   |
| ----------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `init`            | `text`, `theme`, `settings` | The answer to `ready`. The editor shows `text` and resets its state.                   |
| `documentChanged` | `text`                      | The text changed outside the editor: a text editor, `git checkout`, undo, revert.      |
| `theme`           | `kind`                      | The VS Code colour theme changed.                                                      |
| `requestExport`   | `format` (`svg` or `png`)   | An export command wants the diagram rendered. The answer is defined with the commands. |

`theme` and `kind` are `light`, `dark`, `high-contrast` or `high-contrast-light` (VS Code's theme
kinds). `settings` holds the `ariadne.editor.*` settings the editor needs: `autoLayout` (boolean).

## Editor → host

| `type`       | Fields    | When                                                                                 |
| ------------ | --------- | ------------------------------------------------------------------------------------ |
| `ready`      |           | The editor is loaded and waits for `init`. Sent once, at start.                      |
| `edit`       | `text`    | The user changed the diagram. `text` is the whole new document. The host applies it. |
| `error`      | `message` | Something the user should know, e.g. the document cannot be read.                    |
| `showAsText` |           | "Open as text" in the error state: the host opens the file in the text editor.       |

## Sequence

```
editor ── ready ─────────────▶ host
editor ◀──────────── init ──── host        (text, theme, settings)
editor ── edit {text} ───────▶ host        (the user drags, renames, …)
                                host applies a WorkspaceEdit; the document is dirty
editor ◀── documentChanged ─── host        (only when the text differs from what the editor sent)
```

The host answers an `edit` it applied itself with no `documentChanged`; the editor ignores a
`documentChanged` whose text equals the last text it sent.

## The embedded build

`pnpm --filter @ariadne/web build:embedded` builds the editor for the webview into
`apps/web/dist/embedded`; the extension copies it to `dist/webview`.

- **Relative URLs**: `<base href="./">`, no hashes in file names. The host replaces the base with the
  webview URI of the folder (`webview.asWebviewUri`), so the `.wasm` files, which the app reads
  relative to the base, load from the same place.
- **No inline scripts**: critical CSS is not inlined. The host adds a nonce to every `<script>` and
  `ngCspNonce` to `<app-root>`, so Angular's own style elements carry it too. The policy is
  `default-src 'none'`; scripts by nonce and `'wasm-unsafe-eval'`; styles from the extension and
  inline (f-flow sets styles at run time); images, fonts and `fetch` only from the extension.
- **No service worker** (the app has none).
- **Embedded mode** (`EditorHost.embedded`): no file actions, export menu, file name, theme toggle
  or undo/redo buttons; the editor's own undo history is off and Ctrl+Z, Ctrl+S, Ctrl+O are left to
  VS Code, which undoes and saves the document.
