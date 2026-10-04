# Ariadne for VS Code

Edit MassTransit saga diagrams (`*.saga.yaml`) next to the code. See
[ADR 0016](../../docs/adr/0016-vscode-extension.md) and the
[webview protocol](../../docs/specs/vscode-protocol.md).

## Developing

| What                | How                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Try the extension   | `pnpm --filter ariadne-vscode dev [folder] [--with-yaml]` builds it and starts the VS Code the integration tests use, with its own profile in `.vscode-test/` (your VS Code is not touched). It opens `samples/` by default. `--with-yaml` also installs the Red Hat YAML extension there, to try the JSON Schema. |
| Debug the extension | Run the `dev` script, then the launch configuration **Attach to Extension Host** (port 9229). Or use **Run Extension**, which starts your own installed VS Code.                                                                                                                                                   |
| Unit tests          | `pnpm --filter ariadne-vscode test`                                                                                                                                                                                                                                                                                |
| Integration tests   | `pnpm --filter ariadne-vscode test:integration` (headless on Linux: `test:integration:ci`, which uses xvfb). Set `ARIADNE_VSCODE_PATH` to use an installed VS Code instead of downloading one.                                                                                                                     |
