# ADR 0016: A VS Code extension that reuses the Angular editor

- Status: accepted
- Date: 2026-10-03
- Issues: #178, #179, #180, #182, #185, #188
- Builds on: [ADR 0001](0001-flow-editor-foundations.md), [ADR 0002](0002-yaml-files-and-file-storage.md), [ADR 0006](0006-typescript-monorepo.md)

## Context

Sagas live next to the code that implements them. Editing the diagram in VS Code, beside the C# and in the
same git workflow, is worth more than a separate web page. There must not be a second implementation of the editor.

## Decision

- **`apps/vscode`** is the extension host (Node, bundled by esbuild to one CommonJS file). It reuses
  `@ariadne/core` and the other packages; it has no editor code of its own.
- **The editor is the Angular app**, built a second time with the `embedded` configuration and shown in a
  webview. `EditorHost` (like `FileStorage`) is what the app needs from its surroundings: `BrowserEditorHost` is
  the web app as before, `VsCodeEditorHost` talks to the extension.
- **A `CustomTextEditorProvider`, not a custom binary editor.** The YAML stays a `TextDocument`, so save, dirty
  state, hot exit, revert, git diff, "open with the text editor" and Live Share work without code. The webview
  sends the whole new text (`serializeDiagram()`, deterministic) and the extension applies it as a `WorkspaceEdit`.
- **One undo history**: VS Code's. The webview's own history is off in embedded mode, and Ctrl+Z reaches the
  document through VS Code.
- **A versioned message protocol** in its own package, `@ariadne/editor-protocol`, so both sides share the types
  and the checks. It is documented in [the protocol spec](../specs/vscode-protocol.md).
- **A strict Content Security Policy** for the webview: scripts only by nonce, everything else from the extension.
  The extension rewrites the built `index.html` at run time (base URI, nonces) instead of the build knowing about
  VS Code.
- **Tests** run in a real VS Code with `@vscode/test-electron` (xvfb in CI); logic without the VS Code API is tested
  with Vitest.

## Consequences

- The embedded build adds a few seconds to `pnpm build`; the Docker image does not build it.
- Features that need a file dialog or the browser (image export, importing C#) go through the host in the
  extension; the embedded editor hides their buttons until the commands exist.
