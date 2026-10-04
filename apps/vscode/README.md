# Ariadne for VS Code

Edit [MassTransit](https://masstransit.io) saga state machines as diagrams, next to the C# that
implements them. A saga is a YAML file, `*.saga.yaml`, that you commit like code.

## What it does

- **Visual editor**: a `*.saga.yaml` opens as a diagram. Drag, connect, rename and add states; the
  file stays a normal text document, so save, undo, git diff, source control and "Open with Text
  Editor" all work.
- **Import from C#**: a CodeLens above a `MassTransitStateMachine<T>` class turns it into a diagram.
- **Generate C#** from a diagram: the state machine, the saga instance and the message contracts.
  Pick the files to write; changed files can be compared first.
- **Drift**: when a diagram names its C# file, saving either one compares them and shows what
  differs in the Problems panel, with quick fixes to update the diagram from the code or open a diff.
- **Go to code**: from a state or transition in the diagram to the matching line in the C#.
- **Export** as SVG, PNG, Mermaid or a Markdown page; copy Mermaid or Markdown to the clipboard.
- **Markdown preview**: a fenced ` ```saga ` block, or `![](order.saga.yaml)`, shows the diagram.
- **Text editing**: a JSON Schema (completion, hover, validation with the
  [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)) and
  problems with line positions, with or without the diagram editor.

It follows your colour theme, light, dark or high contrast.

## Getting started

1. Open a folder with a `*.saga.yaml`, or run **Ariadne: New Saga Diagram** from the Command Palette
   (or the Explorer context menu of a folder).
2. Or open a C# file with a state machine and click **Ariadne: Import as saga diagram** above the class.
3. Use the buttons in the editor's title bar to generate C# or export.

## Commands

All commands are in the Command Palette under **Ariadne**.

| Command                                                                               | What it does                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| New Saga Diagram                                                                      | Creates a `*.saga.yaml` in a folder and opens it.                      |
| Open Saga Diagram / Show Saga Diagram as Text                                         | Switches between the diagram and the YAML of the same file.            |
| Import Saga from C#…                                                                  | Writes `<Class>.saga.yaml` from a state machine class.                 |
| Generate C#                                                                           | Writes the state machine, saga instance and contracts for the diagram. |
| Export Diagram…, Export as SVG / PNG / Mermaid / Markdown, Copy as Mermaid / Markdown | Exports the diagram next to the file, or to the clipboard.             |

## Settings

| Setting                      | Default | What it does                                                                                   |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `ariadne.import.folder`      | ``      | Folder for diagrams imported from C#, relative to the workspace folder. Empty: next to the C#. |
| `ariadne.generate.folder`    | ``      | Folder for generated C#. Empty: next to the C# the diagram names, else next to the diagram.    |
| `ariadne.generate.namespace` | ``      | Namespace for generated C# when the diagram has none.                                          |
| `ariadne.export.folder`      | ``      | Folder for exported files. Empty: next to the diagram.                                         |
| `ariadne.drift.enabled`      | `true`  | Compare a diagram with its C# file on save and report differences.                             |

## Notes

- A diagram names its C# file in `saga.source`; import writes it, and drift, generate and Go to code
  use it.
- Nothing is written without a look: a different existing diagram is shown as a diff before it is
  replaced, and generated files are picked from a list.
- Everything runs on your machine; the C# is read with a parser that ships inside the extension.

Source, issues and the file format: <https://github.com/GravionLabs/ariadne>.

Licensed under the [MIT License](https://github.com/GravionLabs/ariadne/blob/main/LICENSE).
