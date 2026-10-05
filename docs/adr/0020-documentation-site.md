# ADR 0020: The documentation site: VitePress, with `docs/` as the only source

- Status: accepted
- Date: 2026-10-05
- Issues: #282, #321
- Builds on: [ADR 0006](0006-typescript-monorepo.md), [ADR 0019](0019-dependency-updates-and-supply-chain.md)

## Context

The user guide is Markdown in `docs/guide`, written to be read on GitHub, with relative links to samples,
source files and other pages. People who only want to try Ariadne should not need a clone or a GitHub account:
the guide needs to be a website, next to the editor as a live demo. A second copy of the text would drift, so the
Markdown in the repository has to stay the single source.

## Decision

### VitePress in `apps/site`, reading `docs/` in place

- `apps/site` (`@ariadne/site`, private) is a VitePress project whose `srcDir` is `../../docs`: nothing is copied.
  The site contains `docs/guide/**`, `docs/specs/diagram-format.md` and `docs/self-hosting.md`; the ADRs, the
  other specs, the examples and the images folder are excluded (`srcExclude`). VitePress was chosen over a
  hand-made renderer for its search, dark mode and sidebar, and because it renders plain Markdown with
  few conventions of its own.
- `docs/guide/README.md` is what GitHub shows for the folder and is the home of the guide (`rewrites` to
  `guide/index.md`). `docs/index.md` is the landing page of the site.
- **The sidebar is read from the numbered list of `docs/guide/README.md`** at build time, so a page is added in
  one place. A test fails when a page of `docs/guide` is missing from that list.
- **Links to files of the repository that the site does not contain** (sample folders, `.cs` files, ADRs, the
  READMEs of packages) are rewritten to `https://github.com/GravionLabs/ariadne/blob/main/<path>` (`tree/main`
  for folders) by a small markdown-it plugin (`.vitepress/repo-links.ts`). The Markdown is unchanged, so the same
  links work on GitHub. A link to something that is not in the repository is left alone, and
  VitePress's dead-link check fails the build.
- **Dead links fail the build.** Only the example addresses of a local run (`http://localhost:4200`) are exempt.
  `pnpm build` at the root builds the site (3 s), so CI catches a broken link in any pull request.
- Images are bundled by VitePress, including the light and dark `<picture>` elements of the guide. Those follow
  the visitor's system setting (`prefers-color-scheme`), not the site's own theme toggle.
- The logo is the favicon of the web app, served from where it is (`.vitepress/assets.ts`).

### Where it is published (#322, #323)

On GitHub Pages, at `https://gravionlabs.github.io/ariadne/`, as one artifact that `.github/workflows/pages.yml`
puts together (`apps/site/scripts/assemble.mjs`, which refuses to publish a half-built site):

| Address    | What                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `/`        | the documentation site (VitePress, `SITE_BASE=/<repository>/`)                                          |
| `/app/`    | the editor, built with the `demo` configuration (`production,demo`, `--base-href …/app/`)               |
| `/viewer/` | a page linking the viewer's plain HTML demo (`/viewer/demo/`) and the Angular demo (`/viewer/angular/`) |

- The `demo` configuration replaces `app.config.ts` like `embedded` does and provides `DEMO_MODE`: a notice says that
  diagrams stay in the browser, and can be dismissed (remembered in `localStorage`, if the browser allows it).
- `/app/?sample=<id>` opens a sample, as **New → sample** does, and takes the parameter out of the address. The
  sample tables of the guide get an "Open in the demo" link on the site only (`.vitepress/demo-links.ts`), so the
  Markdown stays plain on GitHub.
- A pull request that touches `apps/site`, `docs` or the workflow builds all of it (check "Build the site") without
  deploying; only `main` deploys, and only while the repository variable `DEPLOY_PAGES` is `true`, with Settings →
  Pages → Source set to "GitHub Actions".
- There is no analytics and no custom domain.

## Consequences

- The text of the guide is edited in `docs/guide` as before; the site follows on the next deploy.
- A new page of the guide needs a line in the numbered list of `docs/guide/README.md`, or its test fails.
- `vue` is hoisted to the top `node_modules` (`publicHoistPattern` in `pnpm-workspace.yaml`): VitePress compiles the
  Markdown files, which are outside any package, to modules that import it.
- VitePress is a new dependency family; Renovate gets a group for it if its updates become noisy.
