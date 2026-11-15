import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The tests read DATABASE_URL and SECRET_KEY_BASE from .env.test, never .env: .env points at the
// development database. Variables already set (the shell, CI) win over the file.
if (existsSync('.env.test')) process.loadEnvFile('.env.test');

// The e2e tests truncate every table. Refuse to run against anything but a test database,
// whatever set DATABASE_URL (.env.test, the shell, or CI).
const databaseUrl = process.env['DATABASE_URL'];
const databaseName = databaseUrl ? decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) : '';
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `DATABASE_URL must name a database ending in _test (got "${databaseName}"). ` +
    'Copy .env.test.example to .env.test.',
  );
}

// Vitest reads experimentalDecorators and emitDecoratorMetadata from tsconfig.json, so Nest's
// dependency injection works without an SWC plugin. After changing compiler options, delete
// node_modules/.vitest-cache: the transform cache does not notice tsconfig changes.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
    // One file at a time: the e2e specs share one database and truncate it before each test.
    fileParallelism: false,
  },
});
