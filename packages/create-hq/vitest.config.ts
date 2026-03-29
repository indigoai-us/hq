import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120000, // 2 min for network-heavy integration tests
  },
});
