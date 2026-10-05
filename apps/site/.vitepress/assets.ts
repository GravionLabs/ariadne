import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Files of the repository that the site uses by their address and that VitePress does not bundle (the
 * logo): `[address on the site, path in the repository]`. The images of the pages are bundled.
 */
export const SITE_ASSETS: readonly (readonly [string, string])[] = [
  ['logo.svg', 'apps/web/public/favicon.svg'],
];

/** Serves the assets while developing (`vitepress dev`); {@link copyAssets} writes them for a build. */
export function assetsPlugin(repoRoot: string): Plugin {
  return {
    name: 'ariadne-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        for (const [address, source] of SITE_ASSETS) {
          const at = url.indexOf(`/${address}`);
          if (at < 0) continue;
          const root = resolve(repoRoot, source);
          const file = resolve(root, url.slice(at + address.length + 2));
          if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) {
            res.setHeader('Cache-Control', 'no-cache');
            res.end(readFileSync(file));
            return;
          }
        }
        next();
      });
    },
  };
}

/** Copies the assets into the built site (`outDir`). */
export function copyAssets(repoRoot: string, outDir: string): void {
  for (const [address, source] of SITE_ASSETS) {
    const target = join(outDir, address);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(repoRoot, source), target, { recursive: true });
  }
}
