import { defineConfig, devices } from '@playwright/test';

/**
 * Re-captures the screenshots and GIFs of the user guide (`pnpm --filter @ariadne/web capture`).
 * One browser, one window size, one font, one locale and time zone: the same pictures on every
 * machine, so that a change in them is a change in the app. Not part of `pnpm test`.
 */
const port = Number(process.env['CAPTURE_PORT'] ?? 4310);

export default defineConfig({
  testDir: '.',
  // `.capture.ts`, not `.spec.ts`: `ng test` runs every spec of the project.
  testMatch: '**/*.capture.ts',
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './report' }]],
  // One at a time: the pictures share a build, a server and the folder they are written to.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    // 1600 × 900: the top bar needs about 1500 px; at 1280 it is cut off after "Messages", at 1440 after "Path".
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // After the device: its own viewport and pixel ratio would win over the ones above.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: 'node capture/serve.mjs',
    url: `http://localhost:${port}/`,
    // Needs `ng build` first (the `capture` script does it).
    reuseExistingServer: !process.env['CI'],
    cwd: '..',
    timeout: 30_000,
  },
});
