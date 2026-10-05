// Puts the pieces of the public site into one folder, the artifact that GitHub Pages serves:
//
//   /          the documentation site (VitePress, apps/site)
//   /app/      the editor, built as the demo (apps/web, configuration "demo")
//   /viewer/   the viewer's plain HTML demo (/viewer/demo/) and its Angular demo (/viewer/angular/)
//
// Usage: node scripts/assemble.mjs <out>   (from apps/site, after the four builds; see pages.yml)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where each piece is built, relative to the top folder of the repository. */
export const PIECES = {
  site: 'apps/site/.vitepress/dist',
  app: 'apps/web/dist/ariadne/browser',
  viewerScript: 'packages/viewer/dist/ariadne-viewer.js',
  viewerDemo: 'packages/viewer/dist/demo',
  angularDemo: 'apps/viewer-demo/dist/viewer-demo/browser',
};

const LANDING = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ariadne viewer demos</title>
    <style>
      :root { color-scheme: light dark; }
      body { max-width: 40rem; margin: 3rem auto; padding: 0 1rem; font: 16px/1.5 system-ui, sans-serif; }
      li { margin: 0.5rem 0; }
    </style>
  </head>
  <body>
    <h1>The Ariadne viewer</h1>
    <p>
      <code>&lt;ariadne-saga&gt;</code> shows a saga diagram in any web page. Two demos:
    </p>
    <ul>
      <li><a href="demo/">The plain HTML demo</a>: one script, no framework.</li>
      <li><a href="angular/">The Angular demo</a>: the same viewer through its Angular wrapper.</li>
    </ul>
    <p><a href="../guide/viewer">How to use it in your own app</a> · <a href="../">Ariadne</a></p>
  </body>
</html>
`;

/**
 * Copies the built pieces from `repo` into `out` (which is emptied first).
 * Throws, naming the piece, when one is missing: a half-built site must not be published.
 */
export function assemble(repo, out) {
  const from = (piece) => resolve(repo, PIECES[piece]);
  for (const piece of Object.keys(PIECES)) {
    if (!existsSync(from(piece))) {
      throw new Error(`The ${piece} is not built: ${PIECES[piece]} is missing.`);
    }
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(from('site'), out, { recursive: true });
  cpSync(from('app'), join(out, 'app'), { recursive: true });
  const viewer = join(out, 'viewer');
  mkdirSync(viewer, { recursive: true });
  cpSync(from('viewerScript'), join(viewer, 'ariadne-viewer.js'));
  cpSync(from('viewerDemo'), join(viewer, 'demo'), { recursive: true });
  cpSync(from('angularDemo'), join(viewer, 'angular'), { recursive: true });
  writeFileSync(join(viewer, 'index.html'), LANDING);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: node scripts/assemble.mjs <out>');
    process.exit(2);
  }
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  try {
    console.log(`Assembled the site in ${assemble(repo, resolve(out))}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
