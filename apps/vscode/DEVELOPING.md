# Developing the VS Code extension

The README of this folder is the page users see in the marketplace and in the `.vsix`; this file is for
contributors. See
[ADR 0016](../../docs/adr/0016-vscode-extension.md) and the
[webview protocol](../../docs/specs/vscode-protocol.md).

## Developing

| What                      | How                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Try the extension         | `pnpm --filter ariadne-vscode dev [folder] [--with-yaml]` builds it and starts the VS Code the integration tests use, with its own profile in `.vscode-test/` (your VS Code is not touched). It opens `samples/` by default. `--with-yaml` also installs the Red Hat YAML extension there, to try the JSON Schema.                                                                                                                    |
| Debug the extension       | Run the `dev` script, then the launch configuration **Attach to Extension Host** (port 9229). Or use **Run Extension**, which starts your own installed VS Code.                                                                                                                                                                                                                                                                      |
| Unit tests                | `pnpm --filter ariadne-vscode test`                                                                                                                                                                                                                                                                                                                                                                                                   |
| Integration tests         | `pnpm --filter ariadne-vscode test:integration` (headless on Linux: `test:integration:ci`, which uses xvfb). Set `ARIADNE_VSCODE_PATH` to use an installed VS Code instead of downloading one.                                                                                                                                                                                                                                        |
| Integration tests like CI | `pnpm --filter ariadne-vscode test:integration:container` builds the dev container image (`.devcontainer/Dockerfile`) and runs the integration tests in it, with the repository mounted and the dependencies and the downloaded VS Code in Docker volumes (`ariadne-node-modules*`, `ariadne-vscode-test`). Use it to reproduce a failure that only happens in CI. `ARIADNE_TEST_GREP` and `ARIADNE_TEST_RETRIES` are passed through. |
| Package it                | `pnpm --filter ariadne-vscode package [x.y.z]` builds everything and writes `vsix/ariadne-vscode-<version>.vsix` (the version defaults to the one in `package.json`; the release pipeline passes the version of the release).                                                                                                                                                                                                         |
| Test the package          | `pnpm --filter ariadne-vscode test:vsix` installs the `.vsix` into a clean VS Code and checks that the installed extension activates, opens a diagram, and can import and export (needs the files that are packed: the WebAssembly parsers and the font). Headless on Linux: `test:vsix:ci`.                                                                                                                                          |
| Redraw the icon           | `pnpm --filter ariadne-vscode icon` renders `icon.png` from the favicon of the web app.                                                                                                                                                                                                                                                                                                                                               |

### Integration tests in a container, on Windows or macOS

`test:integration:container` needs Docker; on Windows and macOS install Docker Desktop and start it
(on Windows, run the command from a WSL 2 shell with the repository inside the WSL file system for
speed). The container is Linux, so the tests run exactly as they do on the CI runner, whatever the
host is. The first run builds the image and downloads VS Code; later ones reuse both.

## Screenshots for the guide

`pnpm --filter ariadne-vscode capture` re-captures the pictures of the extension in `docs/images/guide`
(`vscode-*-light.png` and `-dark.png`, used by [the guide](../../docs/guide/vscode.md) and later by the marketplace
page). It builds the extension, downloads a pinned VS Code (`VSCODE_VERSION` in `capture/capture.mjs`), and drives it
with Playwright's Electron support in a fresh profile: a 1440 × 900 window, the _Default Light Modern_ and _Default
Dark Modern_ themes, no welcome page, chat or sticky scroll, a copy of `samples/sagas/order` in a temporary folder.

```sh
xvfb-run -a pnpm --filter ariadne-vscode capture              # Linux without a display; elsewhere, no xvfb-run
node capture/capture.mjs problems drift-quick-fix            # only some (the extension must be built)
```

Each capture is a function in `capture/capture.mjs` that puts the window in the state to show; a capture that
cannot find what it expects fails and leaves a picture of the window in `capture/failures/`. The fonts are the
machine's, so install `fonts-dejavu` (CI does) for the same pictures everywhere. Not part of `pnpm test`.

## Installing a `.vsix`

Every release of Ariadne on GitHub carries the extension as `ariadne-vscode-<version>.vsix`.
Download it and run `code --install-extension ariadne-vscode-<version>.vsix`, or use Extensions →
"…" → **Install from VSIX…**. There are no automatic updates: install the next file over the old one.

## Flaky tests

The integration tests drive a real VS Code window, so a step can race the UI. Mocha retries a
failed test once (`ARIADNE_TEST_RETRIES`, default 1), and every test that passed only after a retry
is reported:

- a `FLAKY: "<test>" needed 1 retry` line in the console;
- under GitHub Actions, a `Flaky VS Code test` warning on the run;
- `test-results/vscode-retries.json` at the root of the repository (`[ { "title", "retries" } ]`),
  uploaded by the **VS Code extension** job as the `vscode-retries` artifact.

Treat the warning as a bug in the test (or the extension): wait for a condition instead of time
(see `test/suite/helpers.ts`) and file what you find under #283. The workflow **VS Code
flakiness** runs the suite five times a week without retries to find them early.

To see whether a test is flaky, switch the retries off and run only that test, as often as needed:

```sh
ARIADNE_TEST_RETRIES=0 ARIADNE_TEST_GREP="Document sync" pnpm --filter ariadne-vscode test:integration:ci
```
