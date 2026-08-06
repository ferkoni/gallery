import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["src/global-setup.ts"],
    // Every test file truncates and re-seeds the data tables in beforeAll, so
    // files must not run concurrently against the same database.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
