import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Rasterising a PNG loads the system fonts, which is slow when other tests run alongside.
    testTimeout: 30_000,
    include: ['src/**/*.spec.ts'],
  },
});
