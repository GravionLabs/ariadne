# Ariadne in VS Code

The VS Code extension opens `*.saga.yaml` files as diagrams, next to the C# that implements them. The file stays a
normal text document, so save, undo, git and "Open with Text Editor" work as always. The extension also imports
and generates C#, shows where a diagram and its code have drifted apart, exports, and draws sagas in the Markdown
preview. Every command and setting is listed in [the extension's README](../../apps/vscode/README.md).

## Install

The extension is not in a marketplace yet; every release of Ariadne carries it as a file.

1. Open the [latest release](https://github.com/GravionLabs/ariadne/releases/latest) and download
   `ariadne-vscode-<version>.vsix`.
2. Install it, either
   - in a terminal: `code --install-extension ariadne-vscode-<version>.vsix`, or
   - in VS Code: Extensions view → "…" menu → **Install from VSIX…** and pick the file.
3. Open a folder with a `*.saga.yaml` file, or run **Ariadne: New Saga Diagram** from the Command Palette.

There are no automatic updates: to update, install the newer `.vsix` over the old one. To remove it, uninstall
"Ariadne" in the Extensions view. For YAML completion and validation while you edit the text, also install the
[Red Hat YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml); Ariadne
contributes the schema for it.

## Next

- Import a state machine: a CodeLens above the class says **Import as saga diagram** ([import and generate](import-and-generate.md)).
- Model a saga: [modelling](modelling.md).
- Export: [exports](exports.md); in VS Code use **Ariadne: Export Diagram…**.
