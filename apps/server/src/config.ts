/** Where the built app is and how to listen, from the environment. */
export interface ServerSettings {
  /** The folder with `index.html`: the Angular build's `browser` output. */
  root: string;
  port: number;
  host: string;
  /** What `GET /config.json` answers: runtime settings of the app, e.g. feature flags. */
  config: Record<string, unknown>;
}

/**
 * - `ARIADNE_ROOT`: folder of the built app (default `./web`)
 * - `PORT` (default 8080) and `HOST` (default `0.0.0.0`)
 * - `ARIADNE_CONFIG`: a JSON object served as `/config.json` (default `{}`)
 */
export function settingsFrom(env: Record<string, string | undefined>): ServerSettings {
  const port = Number(env['PORT'] ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be a number from 0 to 65535, not "${env['PORT']}".`);
  }
  let config: unknown = {};
  const json = env['ARIADNE_CONFIG']?.trim();
  if (json) {
    try {
      config = JSON.parse(json);
    } catch (e) {
      throw new Error(`ARIADNE_CONFIG is not valid JSON: ${(e as Error).message}`);
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw new Error('ARIADNE_CONFIG must be a JSON object.');
    }
  }
  return {
    root: env['ARIADNE_ROOT'] || './web',
    port,
    host: env['HOST'] || '0.0.0.0',
    config: config as Record<string, unknown>,
  };
}
