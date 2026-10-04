# Performance budgets

How fast the hot paths of Ariadne must stay on large sagas, and how that is checked. The approach is
in [ADR 0018](../adr/0018-performance-budgets.md).

Run them with `pnpm perf` (all packages, one after the other) or `pnpm --filter <package> perf`. They
are named `*.perf.ts` (the editor's `editor.perf.spec.ts`) and are not part of `pnpm test`. CI runs
them in the job **Performance budgets**, where every call prints a `perf:` line with its number. The
sagas come from `largeSaga(states)` in `@ariadne/core/testing`: 50, 150 and 300 states, with
decisions, loops, joins, compensations, requests and timers. A 150-state saga is a diagram of about
2000 × 37000 px, 300 states about 3300 × 74000 px.

A benchmark fails when its median (of 7 runs after 2 warm-up runs) is over the budget, and warns
(`::warning`) above 70% of it. **Budgets are never raised to make a test pass.**

## Budgets

_Milliseconds, medians. "CI" is the highest median seen on the CI runs of the pull request that
added the budgets, and the budget (bold) is 3× the highest median seen anywhere (CI or a developer
machine), rounded up, 50 ms at least. Two budgets are targets chosen in advance, not 3× of a
measurement: opening 150 states in the editor takes under 1 s, and selecting a state there under
0.5 s._

| Operation                         | Package     | 50 states: CI / budget | 150 states: CI / budget | 300 states: CI / budget |
| --------------------------------- | ----------- | ---------------------- | ----------------------- | ----------------------- |
| parseDiagram                      | core        | 40 / **120**           | 51 / **160**            | 64 / **200**            |
| serializeDiagram                  | core        | 10 / **50**            | 23 / **70**             | 26 / **80**             |
| validate                          | core        | 0.7 / **50**           | 1.7 / **50**            | 2.4 / **50**            |
| layoutDiagram                     | core        | 92 / **280**           | 114 / **600**           | 668 / **2050**          |
| buildCatalog                      | core        | 0.7 / **50**           | 0.9 / **50**            | 2.7 / **50**            |
| resolvePath (200 steps)           | core        | 3.3 / **50**           | 2.3 / **50**            | 4.4 / **50**            |
| renderDiagramSvg (with layout)    | export      | 62 / **190**           | 148 / **450**           | 700 / **2150**          |
| diagramToMermaid                  | export      | 0.4 / **50**           | 0.6 / **50**            | 1 / **50**              |
| diagramToMarkdown                 | export      | 1.5 / **50**           | 2.8 / **50**            | 6.1 / **50**            |
| importSagas (C# of the saga)      | masstransit | 19 / **60**            | 58 / **170**            | 98 / **300**            |
| SVG to PNG (CLI)                  | cli         | 1024 / **3500**        | 1082 / **3500**         | 1800 / **6000**         |
| checkDiagramText (Problems panel) | vscode      | 28 / **90**            | 69 / **210**            | 125 / **380**           |
| viewer: source to load            | viewer      | 230 / **700**          | 554 / **1700**          | 1526 / **4600**         |
| viewer: path set                  | viewer      | 51 / **160**           | 132 / **410**           | 274 / **850**           |
| editor: open                      | web         | –                      | 968 / **1000**          | 1811 / **5450**         |
| editor: select a state            | web         | –                      | 210 / **500**           | 865 / **3600**          |
| editor: edit a state (re-layout)  | web         | –                      | 144 / **450**           | 505 / **1700**          |

Change detection of the editor: one `ApplicationRef` tick for opening, for selecting and for editing
(budget: 3 each), so a change does not run the whole app more than once.

The editor's numbers are jsdom's, not a browser's: they catch work that grows (layouts, cycles, DOM
created), not how it feels. At 300 states, **selecting** is dominated by the inspector creating about
a thousand `<option>` elements (every transition lists every state it can lead to, and "To an
existing state" lists them again). jsdom makes creating an element slower the bigger the page is; a
browser does it in milliseconds. Listing the options only when a select is used would remove it, but a
native select opens before code can fill it, so it is not done.

## What the first benchmarks found

- **PNG export of the CLI:** 16 s for 50 states and 47 s for 150 on a machine with many fonts (CI: 2 s
  and 6 s, 300 states over half a minute), against about 1 s now. It loaded every system font for each
  picture, and drew at 2× whatever the size: a 150-state saga is 37 000 px tall, 300 megapixels at 2×,
  more than a canvas can be. It now draws with a bundled font (like the extension), and the longest
  side of a PNG is 16 384 px (`pngScale` in `@ariadne/export`, also used by the editor's export: a
  larger canvas draws nothing in a browser). The stopwatch of the SVG was not in that font and is a
  clock face now.
- **Editor:** the template made new objects for every card on every change detection, and the
  inspector listed the target states in a quadratic way on every change detection. Selecting a state at
  150 states went from 229 to 172 ms (jsdom, one machine) and at 300 from 1501 to 1199 ms.
- Nothing else is near its budget: parsing, validating, laying out and exporting 150 states takes well
  under 0.2 s on CI (the target was 1 s), importing the C# of 300 states 0.1 s.

## Bundle sizes

The web app: the budgets in `apps/web/angular.json` (initial bundle: warning at 1.1 MB, error at
1.3 MB; a component's styles: warning at 8 kB, error at 12 kB), checked by every production build.

The viewer: `pnpm --filter @ariadne/viewer size` after `package` (CI job **Viewer package**) measures
the files of the package, in gzip, against budgets about 15% above their size when they were set. Over
the budget fails; above 90% warns. The budgets are in `packages/viewer/scripts/size-budget.mjs`.

| File                                                      | Raw      | Gzip    | Budget (gzip) |
| --------------------------------------------------------- | -------- | ------- | ------------- |
| `dist/ariadne-viewer.js` (one file, for a `<script>` tag) | 202.2 kB | 66.6 kB | **77 kB**     |
| `dist/index.js` (the package)                             | 363.5 kB | 89.7 kB | **104 kB**    |
| `dist/angular/index.js` (the Angular wrapper)             | 8.0 kB   | 2.2 kB  | **2.6 kB**    |
