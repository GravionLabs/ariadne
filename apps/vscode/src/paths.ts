import * as path from 'node:path';

/**
 * `file` as seen from the folder `fromDir`, with `/` as separator whatever the system: how a
 * diagram names its C# file (`saga.source`). Another drive (Windows) has no relative path; the
 * absolute path is kept then.
 */
export function relativePosix(fromDir: string, file: string): string {
  const relative = path.relative(fromDir, file);
  if (path.isAbsolute(relative)) return file.split(path.sep).join('/');
  return relative.split(path.sep).join('/');
}

/** The path a diagram's `saga.source` points to; `base` is the folder of the diagram file. */
export function resolveSource(base: string, source: string): string {
  return path.resolve(base, ...source.split('/'));
}
