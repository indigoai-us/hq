import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk.out'],
    testTimeout: 120_000, // 2-minute timeout for AWS operations
    hookTimeout: 60_000,
  },
});
