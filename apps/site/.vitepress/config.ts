import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { assetsPlugin, copyAssets } from './assets';
import { demoLinksPlugin } from './demo-links';
import { repoFilesOnDisk, repoLinksPlugin, REPO_URL } from './repo-links';
import { sidebarOf } from './sidebar';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const files = repoFilesOnDisk(repoRoot);
const base = process.env['SITE_BASE'] ?? '/';
const readme = readFileSync(resolve(repoRoot, 'docs/guide/README.md'), 'utf8');

export default defineConfig({
  title: 'Ariadne',
  description:
    'Diagrams for MassTransit saga state machines: build a saga as a picture, keep it in git as a small YAML file, import and generate C#.',
  lang: 'en',
  // `/<repository>/` on GitHub Pages; the workflow sets SITE_BASE.
  base,
  // The site is the documentation of the repository: its pages are the files of `docs`.
  srcDir: '../../docs',
  srcExclude: ['adr/**', 'examples/**', 'images/**', 'specs/!(diagram-format).md', 'specs/*.json'],
  // `docs/guide/README.md` is what GitHub shows for the folder, and the home of the guide here.
  rewrites: { 'guide/README.md': 'guide/index.md' },
  cleanUrls: true,
  lastUpdated: false,
  // A link that leads nowhere fails the build. Only the example addresses of a local run are exempt
  // (`http://localhost:4200`): they are meant to be typed, not followed.
  ignoreDeadLinks: [/^https?:\/\/localhost(:\d+)?(\/|$)/],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]],
  markdown: {
    config: (md) => {
      // First: it reads the addresses as they are written, before the other one rewrites them.
      demoLinksPlugin(md as never, base);
      repoLinksPlugin(md as never, files);
    },
  },
  vite: { plugins: [assetsPlugin(repoRoot)] },
  buildEnd: (site) => copyAssets(repoRoot, site.outDir),
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Ariadne',
    nav: [
      { text: 'Guide', link: '/guide/' },
      // Not pages of this site (the workflow adds them next to it): a full page load.
      { text: 'Try the editor', link: '/app/', target: '_self' },
      { text: 'Viewer demo', link: '/viewer/', target: '_self' },
      { text: 'File format', link: '/specs/diagram-format' },
      { text: 'GitHub', link: REPO_URL },
    ],
    sidebar: sidebarOf(readme),
    search: { provider: 'local' },
    editLink: {
      pattern: `${REPO_URL}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    footer: { message: 'Released under the MIT licence.' },
  },
});
