import { defineConfig, type Plugin } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import { readFileSync } from 'fs';
import path from 'path';

// The dev strangler for the Rails-to-Node migration. The endpoints listed in
// ported-endpoints.json ("METHOD /path", written as the contract suite names them) go to the
// Node API; everything else under /api/v1, and /cable, goes to Rails. The list is the only
// place that says which backend owns what, and it is protected (rails-to-node ticket 04).
const NODE_API = 'http://localhost:4000';
const RAILS_API = 'http://localhost:3000';
const NODE_MARK = '/__node';

type RouteMatcher = (method: string | undefined, pathname: string) => boolean;

function loadPortedEndpoints(): RouteMatcher[] {
  const file = path.resolve(__dirname, 'ported-endpoints.json');
  const entries: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(entries)) throw new Error(`${file} must be a JSON array`);

  return entries.map((entry: unknown) => {
    const parsed = typeof entry === 'string' ? /^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/.exec(entry) : null;
    if (!parsed) throw new Error(`${file}: "${String(entry)}" is not "METHOD /path"`);
    const [, method, route] = parsed;
    // A :placeholder matches one path segment, and the whole path must match: no prefixes.
    const pattern = route
      .split('/')
      .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    const regex = new RegExp(`^${pattern}$`);
    return (requestMethod, pathname) => requestMethod === method && regex.test(pathname);
  });
}

// Vite's proxy picks a target by path only. This middleware runs before it and marks the
// requests Node owns; the proxy's NODE_MARK key strips the mark and forwards them, so
// streaming, errors and headers are still Vite's own proxy's.
function routePortedEndpointsToNode(): Plugin {
  const matchers = loadPortedEndpoints();
  return {
    name: 'route-ported-endpoints-to-node',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (matchers.some((matches) => matches(req.method, pathname))) req.url = NODE_MARK + req.url;
        next();
      });
    },
  };
}

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
