import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { compress } from 'hono/compress';

export interface AppOptions {
  /** The folder with the built app (`index.html` and its assets). */
  root: string;
  /** The body of `GET /config.json`. */
  config?: Record<string, unknown>;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** A build output with a content hash in its name (`main-QHT6H3XT.js`) never changes. */
const HASHED = /-[A-Za-z0-9_-]{8,}\.(js|css)$/;

/**
 * The Content-Security-Policy for the app: everything from the same origin, WebAssembly for the C#
 * parser, and the few inline scripts Angular's build puts in `index.html`, allowed by their hash.
 */
export function contentSecurityPolicy(indexHtml: string): string {
  const hashes = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
  );
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}`.trim(),
    // Angular and f-flow set styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** The Ariadne web app as an HTTP app: static files with an SPA fallback, `/config.json`, `/health`. */
export async function createApp(options: AppOptions): Promise<Hono> {
  const root = resolve(options.root);
  const indexPath = join(root, 'index.html');
  const csp = contentSecurityPolicy(await readFile(indexPath, 'utf8'));
  const app = new Hono();

  app.use(compress());
  app.use(async (c, next) => {
    await next();
    c.header('Content-Security-Policy', csp);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  app.get('/health', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'ok' });
  });

  app.get('/config.json', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(options.config ?? {});
  });

  app.get('*', async (c) => {
    let path: string;
    try {
      path = decodeURIComponent(c.req.path);
    } catch {
      return c.text('Bad request', 400);
    }
    const wanted = normalize(join(root, path));
    if (wanted !== root && !wanted.startsWith(root + sep)) return c.text('Not found', 404);

    const info = await stat(wanted).catch(() => null);
    if (info?.isFile())
      return send(c.req.raw, wanted, info.size, info.mtimeMs, cacheControl(wanted));
    // A route of the app (`/anything`) opens the app; a missing file (`/missing.js`) is a 404.
    if (extname(path)) return c.text('Not found', 404);
    const index = await stat(indexPath);
    return send(c.req.raw, indexPath, index.size, index.mtimeMs, 'no-cache');
  });

  return app;
}

function cacheControl(file: string): string {
  if (HASHED.test(file)) return 'public, max-age=31536000, immutable';
  // Everything else (index.html, icons, the .wasm files) is checked with its ETag every time.
  return 'no-cache';
}

function send(
  request: Request,
  file: string,
  size: number,
  mtime: number,
  cache: string,
): Response {
  const etag = `W/"${size.toString(16)}-${Math.floor(mtime).toString(16)}"`;
  const headers = {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cache,
    ETag: etag,
  };
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}
