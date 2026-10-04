# ADR 0017: An embeddable saga viewer: a custom element on the SVG renderer

- Status: accepted
- Date: 2026-10-04
- Issues: #257, #239, #240, #287, #288
- Builds on: [ADR 0009](0009-image-export.md), [ADR 0011](0011-markdown-documentation-export.md), [ADR 0012](0012-validation-catalog-walkthrough.md), [ADR 0015](0015-versioning-and-releases.md)

## Context

Teams want to show the saga of a service in their admin tools and documentation, loaded from their API or
repository, read-only. Most of those apps are Angular, but not all. The viewer must be small, must look like the
exports, and must not pull the editor (f-flow, the store, the file dialogs) into other people's bundles.

## Decision

- **The viewer draws with `renderDiagramSvg`** from `@ariadne/export`, the framework-free renderer that the
  exports, the CLI and the VS Code Markdown preview already use, and adds interaction on top (selection, zoom, pan,
  emphasis). It looks exactly like the exports, not like a second renderer.
- **It ships as a custom element `<ariadne-saga>`**, so any web app can use it, plus a thin **Angular wrapper**.
  The element has no framework dependency; its only dependencies are `@ariadne/core`, `@ariadne/export` and the
  viewer's own code.
- **Options it replaces**
  - _An Angular library of the editor's f-flow components._ Needs an editor refactor, ties every consumer to
    Angular and f-flow, and its bundle carries editing code that the viewer never uses.
  - _The read-only editor in an iframe._ Heavy (a whole app per diagram), awkward to theme, and the host cannot
    select, emphasise or annotate states without a message protocol of its own.
- **The editor does not change.** The Angular editor keeps its f-flow canvas for editing.

## Packaging

- One package, **`packages/viewer`**, with two entry points: `@ariadne/viewer` (the element) and
  `@ariadne/viewer/angular` (the wrapper).
- The element has no framework dependency. The wrapper lists `@angular/core`, `@angular/common` and `rxjs` as
  **peer dependencies** and states the supported Angular range in its README (the major the editor uses and the one
  before). Packages never import from `apps/` (ADR 0006).
- Published to **npm**, with the version of the release (ADR 0015); the npm account and token are the owner's.

## Building and publishing (#244)

- **One tarball, nothing to install with it.** esbuild bundles `@ariadne/core`, `@ariadne/export` and the YAML and
  layout libraries into `dist/index.js`; rollup-plugin-dts bundles their declarations into `dist/index.d.ts`. The
  workspace packages stay private. A single file for plain HTML pages, `dist/ariadne-viewer.js`, registers the element
  when loaded (`unpkg` and `jsdelivr` point to it).
- **The wrapper is compiled with `ngc` in partial mode**, against the element's published declarations, and then
  bundled to one file (and one `.d.ts`), because Node's ES module loader and TypeScript's `node16` resolution do not
  take extensionless relative imports. The consumer's Angular build links the partial declarations.
- **In the workspace the entry points are the TypeScript sources**; `publishConfig` swaps in the build when packing,
  so apps and tests need no build of the viewer.
- **The pack is tested as a consumer would use it** (`test:package`): installed into an empty project, the element is
  imported without a DOM, the Angular entry is loaded and type-checked with `node16`, and the one-file bundle draws a
  saga in jsdom.
- **CI** packs the package on every build with the version of the release; on `main`, after the release, a job
  publishes it to npm only when the repository variable `PUBLISH_NPM` is `true` (it is `false` until the owner decides)
  and the owner's `NPM_TOKEN` secret exists.

## The element

- **Shadow DOM**, so the host's CSS does not leak in and the viewer's does not leak out. Several elements on one
  page share no state; the SVG's ids are prefixed per element.
- **Theming** with CSS custom properties (`--ariadne-*`, with today's colours as fallbacks), for `theme="light"`,
  `"dark"` and `"auto"` (follows `prefers-color-scheme`). `::part` names the toolbar, the diagram and the panels
  where a host needs to restyle them. The SVG gets colours as custom properties only when asked (an export option);
  the plain exports keep hex colours.
- **Addressable SVG.** States and transitions are groups with stable `data-node-id`, `data-edge-id` and `data-kind`
  attributes; selection, emphasis and the path view work on them.

## Loading

- **`src`** (fetched by the element; by `HttpClient` in the wrapper, so the host's interceptors, auth and base URLs
  apply) or **`source`** (YAML text). Changing either renders again.
- Files are read with the same reader as the editor: format version 3 and older are accepted.
- **Error states**, each with an `error` event: network failure, an invalid file (with the reader's message), and a
  newer format version (named, so the host knows to update the viewer). A `load` event reports success.

## Public API

Public: the attributes and properties `src`, `source`, `direction`, `theme`, `features`, `path`, `emphasis`; the
events `load`, `error`, `select`, `walkthrough` and `pathresolved` (the Angular wrapper has them as outputs
`loaded`, `failed`, `selected`, `walkthroughChanged`, `pathResolved`); the CSS custom properties and parts. The
exact names are fixed in the PBI that adds each and listed in the package README.

Internal: the layout, the SVG's structure beyond the `data-*` attributes, the shadow DOM's class names and
everything not exported from the two entry points.

## Features on top

Opt-in extras (`features="walkthrough messages problems"`) use the logic of `@ariadne/core` that the editor uses
(walkthrough, message catalog, validation) and draw on the viewer's SVG. The path view draws the path a saga
instance took from a history the host supplies, resolved by a pure `resolvePath` in `@ariadne/core` (the editor's
**Path** panel shows the same view for a pasted path, read-only like the walkthrough). Ariadne
documents sagas only: it does not run or monitor them.

## Consequences

- `renderDiagramSvg` gets two options (id prefix, CSS custom properties) and the SVG gets `data-*` attributes; the
  snapshots and the PNG export stay the same without the options.
- `@ariadne/viewer` is a second published artefact next to the VS Code extension, built and packed in CI.
- Layout runs in the browser (dagre, already a dependency of `@ariadne/export`), so the viewer's bundle includes it.
