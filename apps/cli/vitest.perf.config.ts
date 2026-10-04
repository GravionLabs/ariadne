import { defineConfig } from 'vitest/config';

// Benchmarks with budgets (`*.perf.ts`, run by `pnpm perf`, never by `pnpm test`). One file at a
// time, so that they do not slow each other down.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.perf.ts'],
    fileParallelism: false,
    // The default reporter hides what passing tests print, and the numbers are printed.
    reporters: ['verbose'],
    testTimeout: 600_000,
  },
});
