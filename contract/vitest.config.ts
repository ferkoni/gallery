import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["src/global-setup.ts"],
    // Every test file truncates and re-seeds the data tables in beforeAll, so
    // files must not run concurrently against the same database.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Above the login pacer's longest wait (60s, src/support/auth.ts). A test
    // that logs in can wait out rack-attack's window when runs come back to
    // back; under 60s it timed out mid-wait and its late login spent the next
    // run's budget.
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
});
