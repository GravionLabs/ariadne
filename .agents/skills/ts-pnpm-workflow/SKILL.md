---
name: ts-pnpm-workflow
description: 'Adopt pnpm as the package manager or migrate from npm (install, lockfile, scripts). Use when starting a Node project or migrating an npm project to pnpm.'
disable-model-invocation: true
metadata:
  opencode/autoinvoke: 'false'
---

## Prerequisites

A `package.json` at the project root.

## Steps

1. **Install** — if `pnpm --version` fails: when `corepack --version` fails too (Node.js 26 and later do not bundle corepack), run `npm install -g corepack`; then `corepack enable pnpm`. Only if corepack is not an option: `npm install -g pnpm`
2. **Clean npm artifacts** — delete `package-lock.json` and `node_modules/`
3. **Pin** — set `"packageManager": "pnpm@<version>"` in `package.json` (update if it already exists)
4. **`.npmrc`** — create it only if the project needs pnpm settings; do not add `shamefully-hoist` unless a dependency breaks without it
5. **Scripts** — replace `npm run <x>` with `pnpm <x>` in `package.json` scripts
6. **Release age** — in `pnpm-workspace.yaml` set `minimumReleaseAge: 10080` (minutes, 7 days: pnpm installs no package version younger than that; needs pnpm 10.16 or later). Exempt one package only for a security fix: `minimumReleaseAgeExclude: [<package>]` with the reason in a comment. Check with `pwsh scripts/Test-ReleaseAge.ps1` (JSON `{repo, hasLockfile, minimumReleaseAge, ok}`, exit 1 when a pnpm repository sets less than 4320 or nothing; `-Root <dir>` checks every child git repository)
7. **Install and verify** — `pnpm install` (generates `pnpm-lock.yaml`), then `pnpm build`

## Gotchas

- `preinstall`/`postinstall` lifecycle scripts can behave differently under pnpm — verify they run
- Commit `pnpm-lock.yaml`; make sure `package-lock.json` is removed from tracking
- Update CI to use pnpm

Report: summary, files changed, verify commands (`pnpm build`, `pnpm test`).
