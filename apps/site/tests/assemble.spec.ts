import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PIECES, assemble } from '../scripts/assemble.mjs';

describe('assemble', () => {
  let repo: string;
  let out: string;
  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'ariadne-site-'));
    repo = join(root, 'repo');
    out = join(root, 'out');
  });
  afterEach(() => rmSync(dirname(repo), { recursive: true, force: true }));

  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const buildAll = () => {
    write(`${PIECES.site}/index.html`, 'site');
    write(`${PIECES.site}/guide/index.html`, 'guide');
    write(`${PIECES.app}/index.html`, 'app');
    write(PIECES.viewerScript, 'viewer script');
    write(`${PIECES.viewerDemo}/index.html`, 'plain demo');
    write(`${PIECES.viewerDemo}/order.saga.yaml`, 'saga');
    write(`${PIECES.angularDemo}/index.html`, 'angular demo');
  };
  const read = (path: string) => readFileSync(join(out, path), 'utf8');

  it('puts the site at the root, the editor in app/ and the viewer demos in viewer/', () => {
    buildAll();
    assemble(repo, out);
    expect(read('index.html')).toBe('site');
    expect(read('guide/index.html')).toBe('guide');
    expect(read('app/index.html')).toBe('app');
    expect(read('viewer/ariadne-viewer.js')).toBe('viewer script');
    expect(read('viewer/demo/index.html')).toBe('plain demo');
    expect(read('viewer/demo/order.saga.yaml')).toBe('saga');
    expect(read('viewer/angular/index.html')).toBe('angular demo');
  });

  it('keeps the plain demo working: its script is where its relative path expects it', () => {
    buildAll();
    assemble(repo, out);
    // packages/viewer/demo/index.html loads "../ariadne-viewer.js" from viewer/demo/.
    expect(existsSync(join(out, 'viewer/demo/../ariadne-viewer.js'))).toBe(true);
  });

  it('writes a page for /viewer/ that links both demos and the guide', () => {
    buildAll();
    assemble(repo, out);
    const page = read('viewer/index.html');
    expect(page).toContain('href="demo/"');
    expect(page).toContain('href="angular/"');
    expect(page).toContain('href="../guide/viewer"');
  });

  it('starts from an empty folder', () => {
    buildAll();
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'old.html'), 'old');
    assemble(repo, out);
    expect(existsSync(join(out, 'old.html'))).toBe(false);
  });

  it.each(Object.keys(PIECES))('refuses to assemble when the %s is not built', (piece) => {
    buildAll();
    rmSync(join(repo, PIECES[piece as keyof typeof PIECES]), { recursive: true, force: true });
    expect(() => assemble(repo, out)).toThrow(new RegExp(`The ${piece} is not built`));
    expect(existsSync(join(out, 'index.html'))).toBe(false);
  });
});
