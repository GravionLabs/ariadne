# ADR 0014: A small Node server and a container for self-hosting

- Status: accepted
- Date: 2026-10-03
- Issues: #162, #170, #171, #173, #46
- Builds on: [ADR 0001](0001-flow-editor-foundations.md), [ADR 0006](0006-typescript-monorepo.md), [ADR 0007](0007-csharp-import.md)

## Context

Ariadne 1.0 is a self-hosted web app. Diagrams are files on the user's machine or in their repository, and the
C# import runs in the browser, so the server has little to do: serve the build, say it is alive, and hand the app
a few runtime settings.

## Decision

- **`apps/server`, Hono on Node**, bundled by esbuild into one file. NestJS (modules, DI, decorators) adds weight
  without a benefit at this size. If the server grows (importing from a Git URL, shared storage), this is revisited.
- **Routes**: `GET /health`, `GET /config.json` (the JSON object in `ARIADNE_CONFIG`, never cached), and the static
  app with a fallback to `index.html` for paths without a file extension. A missing file is a 404, so a wrong asset
  URL is not answered with HTML. The file handler stays inside the app folder.
- **Caching**: files with a content hash (`main-QHT6H3XT.js`) for a year and `immutable`; everything else, the
  unhashed `.wasm` files included, is revalidated with an ETag. Answers are gzip-compressed: the C# grammar is 5 MB
  and 320 kB compressed.
- **Security headers**, on every answer: a `Content-Security-Policy` of same-origin sources, `'wasm-unsafe-eval'` for
  the parser, and the hashes of the inline scripts in `index.html` (computed at start-up, so no `'unsafe-inline'` for
  scripts and no change to the Angular build); styles allow `'unsafe-inline'` because Angular and f-flow set styles at
  run time. Plus `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- **The image** is built in two stages: pnpm builds the app and the server; the final stage is Alpine with only the
  Node binary, `server.mjs` and the app (no npm, no yarn), running as a non-root user with a health check.
  It is published to GHCR on every release ([ADR 0015](0015-versioning-and-releases.md)); pull requests that touch it
  build the image and check `/health`.
- **Static hosting** works without the server. The `Pages` workflow publishes `main` to GitHub Pages, but only when
  the repository variable `DEPLOY_PAGES` is `true`, because a public site is the owner's decision.

## Measured

- The image is about 53 MB compressed (what is pulled) and 200 MB on disk; the Node binary is 123 MB of that. The
  goal of 150 MB cannot be met with Node as the runtime; the pull size is what matters in practice.
- Checked in Chrome against the real build behind the CSP: the app starts, lazy chunks load, the WebAssembly of the
  parser compiles, and no violation is reported. The container stops cleanly on `SIGTERM` (exit code 0).

## Consequences

- TLS and authentication are not the server's job; `docs/self-hosting.md` says to put a reverse proxy in front.
- The CSP is part of the contract with the app: a new external origin (fonts, analytics) needs a change in
  `contentSecurityPolicy`.
- The desktop release (#48) is no longer part of "CI and release": it moved under the Tauri feature (#36), which is out
  of scope for 1.0.
