# ADR 0030: Override glob and minimatch to the patched majors

- Status: Proposed
- Date: 2026-11-15
- Issues: #545
- Builds on: [ADR 0019](0019-dependency-updates-and-supply-chain.md), [ADR 0029](0029-pin-vitepress-vite-to-6-4-by-override.md)

## Context

Dependabot alerts #39 and #40 concern glob 13 and minimatch 10.2.6. They come in through mocha 12.0.3 (the VS Code
extension tests) and eslint's `@eslint/config-array`. Both parents pin the older majors and have no release that uses
the fixed ones (glob 14.0.2, minimatch 11.0.1). Both packages run in dev tooling only; the shipped app and the
published site never load them. minimatch 11 needs Node 20 or later.

## Decision

Override both in `pnpm-workspace.yaml`: `glob` resolves to `^14.0.2` and `minimatch` to `^11.0.1`. The override stays
until mocha and eslint depend on the fixed majors themselves; then it is removed.

## Consequences

- The alerts are closed with a lockfile that holds the patched versions.
- The parents run on majors they do not officially target. They use only `glob()` and `Minimatch`, which are
  unchanged, but `pnpm lint`, `pnpm build` and `pnpm test` must keep passing; a failure is the signal to revisit
  this ADR.
- Tooling needs Node 20 or later.
- The override is technical debt with an exit: remove it when mocha and eslint ship the fixed majors.

## Alternatives

- **Dismiss the alerts.** Cheap, because the vulnerable path is dev-only and unreachable, but it leaves vulnerable
  versions in the lockfile and the alert noise.
- **Wait for the parents.** No release is announced; the alerts would stay open for an unknown time.
