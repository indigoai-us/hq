import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Resolve shared dependencies from infra/node_modules so that vi.mock()
// in test files intercepts the same module instance that the handlers import.
// Without this, infra/ resolves these from its own nested node_modules,
// resulting in a different module identity that vi.mock cannot intercept.
const infraNodeModules = resolve(__dirname, '../../infra/node_modules');

export default defineConfig({
  resolve: {
    alias: {
      'sst': resolve(infraNodeModules, 'sst'),
      '@aws-sdk/client-cognito-identity-provider': resolve(infraNodeModules, '@aws-sdk/client-cognito-identity-provider'),
      '@aws-sdk/client-s3': resolve(infraNodeModules, '@aws-sdk/client-s3'),
    },
  },
  test: {
    name: 'e2e',
    include: process.env.RUN_E2E === 'true'
      ? ['tests/e2e/**/*.e2e.test.ts']
      : [],
    passWithNoTests: true,
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
});
