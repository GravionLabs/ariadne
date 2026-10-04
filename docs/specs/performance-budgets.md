# Performance budgets

How fast the hot paths of Ariadne must stay on large sagas, and how that is checked. The approach is
in [ADR 0018](../adr/0018-performance-budgets.md).

Run them with `pnpm perf` (all packages, one after the other) or `pnpm --filter <package> perf`. They
are named `*.perf.ts` and are not part of `pnpm test`. CI runs them in the job **Performance budgets**.
The sagas come from `largeSaga(states)` in `@ariadne/core/testing`: 50, 150 and 300 states, with
decisions, loops, joins, compensations, requests and timers.

A benchmark fails when its median (of 7 runs after 2 warm-up runs) is over the budget, and warns above
70% of it. **Budgets are never raised to make a test pass.**

## Budgets

_Milliseconds. "CI" is the median measured by the CI job, "Budget" is 3× of it rounded up (50 ms at
least), except where the budget is a target stated in advance (marked ◎)._

<!-- The table is filled in from the first CI run; see the git history of this file. -->

## Bundle sizes

The web app: the budgets in `apps/web/angular.json` (initial bundle: warning at 1.1 MB, error at 1.3 MB;
`editor.scss`: 8 kB). The viewer: see below.
