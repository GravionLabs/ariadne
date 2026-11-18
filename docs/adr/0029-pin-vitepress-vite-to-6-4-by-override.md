# ADR 0029: Pin VitePress' vite to 6.4 by override

- Status: Proposed
- Date: 2026-11-15
- Issues: #544
- Builds on: [ADR 0019](0019-dependency-updates-and-supply-chain.md), [ADR 0020](0020-documentation-site.md)

## Context

The documentation site uses VitePress 1.6.x, the latest stable release. It depends on vite 5, and vite 5 together
with esbuild 0.21.5 has open Dependabot alerts. There is no patched 5.x: the fixes are in vite 6.4.4 and later, with
esbuild 0.25 and later. `@vitejs/plugin-vue` 5.2.4 accepts vite 6.

## Decision

Override vite for the site in `pnpm-workspace.yaml`: `vitepress>vite` and `@vitejs/plugin-vue>vite` resolve to
`^6.4.4`. The override stays until VitePress 2 is stable (it uses a newer vite); then it is removed.

## Consequences

- The alerts are closed. They concern the dev server only; the published site is static and never runs vite.
- VitePress runs on a vite major it does not officially target, so the site build (`pnpm build`) must keep passing; a
  failure there is the signal to revisit this ADR.
- The override is technical debt with an exit: remove it when VitePress upgrades.

## Alternatives

- **Upgrade to VitePress 2.x alpha.** Brings a current vite, but an alpha release on the documentation site is
  not worth closing dev-server alerts.
- **Dismiss the alerts.** Cheap, but leaves vulnerable versions in the lockfile and the alerts noise; the override
  costs two lines.
