import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import path from 'path';
import { NODE_MARK, routePortedEndpointsToNode } from './ported-endpoints';

// The dev strangler (rails-to-node ticket 04) is in ported-endpoints.ts.
const NODE_API = 'http://localhost:4000';
const RAILS_API = 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    routePortedEndpointsToNode(),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    proxy: {
      [NODE_MARK]: { target: NODE_API, changeOrigin: true, rewrite: (url) => url.slice(NODE_MARK.length) },
      '/api/v1': { target: RAILS_API, changeOrigin: true },
      '/cable': { target: RAILS_API, changeOrigin: true, ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/tests/**', 'src/main.tsx'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
        perFile: true,
      },
    },
  },
});
