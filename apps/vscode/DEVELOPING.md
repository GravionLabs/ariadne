# Developing the VS Code extension

The README of this folder is the page users see in the marketplace and in the `.vsix`; this file is for
contributors. See
[ADR 0016](../../docs/adr/0016-vscode-extension.md) and the
[webview protocol](../../docs/specs/vscode-protocol.md).

## Developing

| What                | How                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Try the extension   | `pnpm --filter ariadne-vscode dev [folder] [--with-yaml]` builds it and starts the VS Code the integration tests use, with its own profile in `.vscode-test/` (your VS Code is not touched). It opens `samples/` by default. `--with-yaml` also installs the Red Hat YAML extension there, to try the JSON Schema. |
| Debug the extension | Run the `dev` script, then the launch configuration **Attach to Extension Host** (port 9229). Or use **Run Extension**, which starts your own installed VS Code.                                                                                                                                                   |
| Unit tests          | `pnpm --filter ariadne-vscode test`                                                                                                                                                                                                                                                                                |
| Integration tests   | `pnpm --filter ariadne-vscode test:integration` (headless on Linux: `test:integration:ci`, which uses xvfb). Set `ARIADNE_VSCODE_PATH` to use an installed VS Code instead of downloading one.                                                                                                                     |
| Package it          | `pnpm --filter ariadne-vscode package [x.y.z]` builds everything and writes `vsix/ariadne-vscode-<version>.vsix` (the version defaults to the one in `package.json`; the release pipeline passes the version of the release).                                                                                      |
| Test the package    | `pnpm --filter ariadne-vscode test:vsix` installs the `.vsix` into a clean VS Code and checks that the installed extension activates, opens a diagram, and can import and export (needs the files that are packed: the WebAssembly parsers and the font). Headless on Linux: `test:vsix:ci`.                       |
| Redraw the icon     | `pnpm --filter ariadne-vscode icon` renders `icon.png` from the favicon of the web app.                                                                                                                                                                                                                            |

## Installing a `.vsix`

Every release of Ariadne on GitHub carries the extension as `ariadne-vscode-<version>.vsix`.
Download it and run `code --install-extension ariadne-vscode-<version>.vsix`, or use Extensions →
"…" → **Install from VSIX…**. There are no automatic updates: install the next file over the old one.
