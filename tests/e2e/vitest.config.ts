import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    include: process.env.RUN_E2E === 'true'
      ? ['tests/e2e/**/*.e2e.test.ts']
      : [],
    passWithNoTests: true,
    testTimeout: 120_000,
    pool: 'forks',
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
});
