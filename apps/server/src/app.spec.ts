import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, contentSecurityPolicy } from './app';
import { settingsFrom } from './config';

const INDEX = `<!doctype html><html><body><app-root></app-root>
<script src="main-QHT6H3XT.js" type="module"></script>
<script>document.title='x'</script></body></html>`;

let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), 'ariadne-server-'));
  await mkdir(join(root, 'wasm'));
  await writeFile(join(root, 'index.html'), INDEX);
  await writeFile(join(root, 'main-QHT6H3XT.js'), 'console.log(1)');
  await writeFile(join(root, 'favicon.svg'), '<svg/>');
  await writeFile(join(root, 'wasm', 'parser.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d]));
  await writeFile(join(root, '..secret.txt'), 'no');
  app = await createApp({ root, config: { flags: ['viewer'] } });
});

describe('routes', () => {
  it('answers /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('serves the runtime settings as /config.json', async () => {
    const res = await app.request('/config.json');
    expect(await res.json()).toEqual({ flags: ['viewer'] });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('opens the app at / and at every route of the app', async () => {
    for (const path of ['/', '/some/route', '/index.html']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('<app-root>');
    }
  });

  it('serves files by type, and answers 404 for a missing file instead of the app', async () => {
    expect((await app.request('/favicon.svg')).headers.get('content-type')).toBe('image/svg+xml');
    expect((await app.request('/wasm/parser.wasm')).headers.get('content-type')).toBe(
      'application/wasm',
    );
    expect((await app.request('/missing.js')).status).toBe(404);
    expect((await app.request('/wasm/missing.wasm')).status).toBe(404);
  });

  it('does not leave the folder', async () => {
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json']) {
      const res = await app.request(path);
      expect(await res.text(), path).not.toContain('"name"');
    }
    expect((await app.request('/%E0%A4%A')).status).toBe(400);
  });
});

describe('caching', () => {
  it('keeps hashed files for a year', async () => {
    const res = await app.request('/main-QHT6H3XT.js');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates files without a hash, with an ETag', async () => {
    const first = await app.request('/wasm/parser.wasm');
    expect(first.headers.get('cache-control')).toBe('no-cache');
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    const again = await app.request('/wasm/parser.wasm', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
  });

  it('answers HEAD without a body', async () => {
    const res = await app.request('/favicon.svg', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('security headers', () => {
  it('are on every answer, errors included', async () => {
    for (const path of ['/', '/health', '/missing.js']) {
      const res = await app.request(path);
      expect(res.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(res.headers.get('referrer-policy'), path).toBe('no-referrer');
      expect(res.headers.get('content-security-policy'), path).toContain("default-src 'self'");
    }
  });

  it('lets the C# parser run, and only the inline scripts of index.html', () => {
    const csp = contentSecurityPolicy(INDEX);
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp.match(/'sha256-[^']+'/g)).toHaveLength(1);
    expect(csp).toContain("object-src 'none'");
  });
});

describe('settingsFrom', () => {
  it('has defaults', () => {
    expect(settingsFrom({})).toEqual({ root: './web', port: 8080, host: '0.0.0.0', config: {} });
  });

  it('reads the environment', () => {
    expect(
      settingsFrom({
        ARIADNE_ROOT: '/app/web',
        PORT: '3000',
        HOST: '127.0.0.1',
        ARIADNE_CONFIG: '{"a":1}',
      }),
    ).toEqual({ root: '/app/web', port: 3000, host: '127.0.0.1', config: { a: 1 } });
  });

  it('rejects what it cannot use', () => {
    expect(() => settingsFrom({ PORT: 'x' })).toThrow('PORT');
    expect(() => settingsFrom({ ARIADNE_CONFIG: '{' })).toThrow('not valid JSON');
    expect(() => settingsFrom({ ARIADNE_CONFIG: '[]' })).toThrow('JSON object');
  });
});
