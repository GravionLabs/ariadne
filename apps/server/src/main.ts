import { serve } from '@hono/node-server';
import { createApp } from './app';
import { settingsFrom } from './config';

const settings = settingsFrom(process.env);
const app = await createApp({ root: settings.root, config: settings.config });
const server = serve({ fetch: app.fetch, port: settings.port, hostname: settings.host }, (info) => {
  console.log(`Ariadne is serving ${settings.root} on http://${info.address}:${info.port}`);
});

// A container stops with SIGTERM: finish the running requests, then exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
