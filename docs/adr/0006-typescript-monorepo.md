# ADR 0006: A TypeScript monorepo with shared packages

- Status: accepted
- Date: 2026-10-03
- Issues: #162, #163, #164, #165
- Builds on: [ADR 0001](0001-flow-editor-foundations.md)

## Context

Ariadne is one Angular app today. The 1.0 plan (#162) adds a CLI, a small server, a VS Code
extension, a C# importer and generator, and a library other Angular apps can embed (#239). All of
them need the same domain code: the diagram model, the YAML format, validation, layout, the exports.
That code must not depend on Angular, or the CLI and the extension would drag it along.

## Decision

1. **One repository, one pnpm workspace** (`pnpm-workspace.yaml`: `packages/*` and `apps/*`), TypeScript
   only. One language and one toolchain; the importer runs in the browser, so importing never sends
   code anywhere.
2. **Layout**

   ```
   packages/            libraries, no UI of their own
     core/              @ariadne/core: model, YAML format, validation, layout, naming rules, walkthrough, catalog
     export/            @ariadne/export: Mermaid, SVG/PNG, Markdown
     masstransit/       @ariadne/masstransit: C# import and generate
     viewer/            @ariadne/viewer: the embeddable Angular viewer (#239)
   apps/                things you run
     web/               @ariadne/web: the Angular editor (today's app)
     cli/  server/  vscode/
   ```

   Packages are added as their issues are done; today `packages/core` and `apps/web` exist.

3. **Dependency rules.** Arrows point down only:
   `apps/*` → `packages/*`; `viewer` → `core`, `export`; `export` → `core`; `masstransit` → `core`;
   `core` depends on nothing of the repo and on **no framework** (no Angular, no DOM, no Node-only
   APIs), only on small libraries (`yaml`, `@dagrejs/dagre`). Packages never import from `apps/`. A
   file that needs the browser or Angular belongs in an app or in `viewer`.
4. **Packages are consumed as source.** A package's `exports` point at its TypeScript sources, so apps
   compile them with their own tool (Angular CLI, esbuild) and there is no build step between editing
   a package and seeing it in the app. A package that is published (`viewer`, maybe `core`) gets a real
   build then: `ng-packagr` for Angular libraries, `tsc` for the others.
5. **Tooling.** The root holds what is shared: `tsconfig.base.json`, the ESLint flat config, Prettier,
   `.editorconfig`. Each workspace has its own `package.json` and its own tests (Vitest; for the web
   app through `ng test`). The root scripts run across all workspaces: `build`, `test`, `test:ci`
   (`pnpm -r --if-present`), `lint` and `format` / `format:check` (one run over the whole repo).
   `pnpm start` starts the web app.
6. **Per-app build tools.** Angular CLI for `web`, esbuild for the VS Code extension, `tsc` or esbuild
   for the CLI and the server.
7. **Versioning.** One version for the whole repository, tagged on release; the changelog comes from
   conventional commits with git-cliff. Packages that are published together share that version.
8. **CI** runs the root scripts, so a new package is checked without touching the workflow. Test
   results are written to `test-results/junit.xml` at the repository root.

## Consequences

- The Angular app moved from the repository root to `apps/web` (history kept). Paths in docs and editor
  settings changed; the build output is `apps/web/dist/ariadne`.
- Moving code into `@ariadne/core` (#166) is the next step. The files that still import from `editor/`
  (node labels, layout) have to move or be split first, since `core` must not know the editor.
- Consuming source means a package cannot use a TypeScript feature its consumers do not compile
  (decorators, Angular templates). That is fine for framework-free packages.
- The Angular dependencies live in `apps/web/package.json`, so the CLI and the server do not install
  them.
- **`@ariadne/core` is extracted (#166).** It holds the model, the YAML format, the pure edits, naming hints,
  validation, the message catalog, the walkthrough and the layout (sizes, dagre, routes of loops and
  parallel transitions). The web app imports it as `@ariadne/core` (a `workspace:*` dependency plus a
  `paths` entry in `tsconfig.base.json`, so the Angular tools compile the sources). What was Angular
  stayed in the app: the stores (`DiagramStore`, `EditorStore`, …), and `DiagramLayout`, now a thin
  `computed` wrapper over `layoutDiagram`. Node icons and the editor's labels (`NODE_TYPES`) are UI and
  stayed too; `ACTIVITY_VERBS` moved, since the walkthrough text needs it.
- **Apps list the runtime dependencies of the source packages they use.** Angular's test runner leaves bare
  packages external and resolves them from the app, so `apps/web` also depends on `yaml` and
  `@dagrejs/dagre` (the bundler would find them in `packages/core`). Core's own tests run with plain
  Vitest (`globals`, node environment) and read the example sagas with `?raw`.
- **`@ariadne/export` and the CLI (#168).** The exports that need no browser (SVG, Mermaid, the Markdown
  page) are in `packages/export`; PNG stays in the web app (it needs a canvas) and the CLI rasterises the
  SVG with `@resvg/resvg-js`. Node labels (`NODE_INFO`) moved to core so the exports do not need the
  editor's icon table. `apps/cli` is the `ariadne` command: `lint` (exit 1 on errors or too many
  warnings) and `export`. It is bundled with esbuild into one `dist/ariadne.mjs` (a script of its own
  adds the `require` shim that bundled CommonJS packages such as `yaml` need), and its tests run the
  built file against the sample sagas, since the bundle is what is installed. `import`, `generate` and
  `diff` wait for the importer and the generator (#83, #93).
