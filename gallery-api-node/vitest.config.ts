import { defineConfig } from 'vitest/config';

// Vitest reads experimentalDecorators and emitDecoratorMetadata from tsconfig.json, so Nest's
// dependency injection works without an SWC plugin. After changing compiler options, delete
// node_modules/.vitest-cache: the transform cache does not notice tsconfig changes.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
  },
});
