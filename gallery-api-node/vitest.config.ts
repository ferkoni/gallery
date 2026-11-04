import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The e2e tests need DATABASE_URL, from .env like the app.
if (existsSync('.env')) process.loadEnvFile('.env');

// Vitest reads experimentalDecorators and emitDecoratorMetadata from tsconfig.json, so Nest's
// dependency injection works without an SWC plugin. After changing compiler options, delete
// node_modules/.vitest-cache: the transform cache does not notice tsconfig changes.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
  },
});
