# ADR 0018: Performance budgets

- Status: accepted
- Date: 2026-10-04
- Issues: #277, #290, #291, #292, #293, #294
- Builds on: [ADR 0006](0006-typescript-monorepo.md) (packages and apps), [ADR 0012](0012-validation-catalog-walkthrough.md) (input limits)

## Context

Ariadne is documentation: a saga of 20 states is common, one of 150 or 300 is possible (a long
process, or one generated from code). Nothing in the repository said how fast opening, laying out,
exporting or importing such a saga has to be, so a slowdown would only be noticed by a user. One was
found the first time anyone measured: turning a 150-state saga into a PNG took a minute in the CLI.

## Decision

1. **Large sagas are generated, not stored.** `largeSaga(states, seed)` (`@ariadne/core/testing`,
   not part of the public API of the core package) builds the same diagram on every run, with
   decisions, loops, joins, compensations, requests and timers, and no validation errors. The sizes
   are 50, 150 and 300 states. The C# for the importer's benchmark is made from it with the
   existing generator.
2. **A benchmark is an ordinary test file named `*.perf.ts`**, run by `pnpm perf` with its own
   Vitest configuration per package (and `ng test --configuration=perf` for the editor), never by
   `pnpm test`. One file at a time, and packages one after the other, so that benchmarks do not
   slow each other down.
3. **Median of runs.** `measure` runs the work twice to warm up, then seven times, and takes the
   median in milliseconds: robust against one slow run, unlike the mean or the best.
4. **Budget = 3× the highest median measured, rounded up, with 50 ms as the least.** Measurements on CI
   vary from run to run (one layout went from 49 to 92 ms), and the 3× margin is what makes a budget
   fail on a real regression and not on a bad minute. Where a target was stated first (a 150-state saga opens, lays out and renders
   in under a second) the target is the budget, even if it is far above what is measured: a budget is
   not tightened to a number that happens to hold today.
5. **Over budget fails, above 70% warns.** `expectWithinBudget` throws over the budget, and above 70%
   of it prints a GitHub `::warning` annotation, so a slow drift shows on the pull request before it
   breaks anything. Every call prints a `perf:` line with the number.
6. **Budgets are never raised to make a test pass.** A slower result is a bug to fix, or a decision
   in a pull request that says why and updates the table.
7. **The numbers live in [`docs/specs/performance-budgets.md`](../specs/performance-budgets.md)**
   (operation, size, measured on CI, budget) next to the bundle budgets, and in the `BUDGETS`
   constants at the top of each `*.perf.ts` file. The `perf` job of the CI workflow runs them and
   the `release` job waits for it.
8. **Bundle sizes** are guarded the same way: the web app by the budgets in `angular.json`, the
   viewer by `packages/viewer/scripts/size.mjs` (gzip, 15% above its size when the budget was set).

## Consequences

- A slower layout, parser, export or import fails the pull request that made it, with the name of
  the operation and the size.
- The benchmarks take about a minute (the PNG ones most), so they are a separate CI job, in parallel
  with the others, not part of `pnpm test`.
- Budgets are read from the first CI runs of a change that adds a benchmark: a local number is only
  a guide (the CI runner was about as fast as a developer machine, but not always).
- jsdom times for the editor and the viewer are not a browser's: they catch regressions in how much
  work is done (layouts, change detection cycles), not how smooth it feels.
