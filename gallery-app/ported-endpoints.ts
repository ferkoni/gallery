import type { Plugin } from 'vite';
import { readFileSync } from 'fs';
import path from 'path';

// The dev strangler for the Rails-to-Node migration. The endpoints listed in
// ported-endpoints.json ("METHOD /path", written as the contract suite names them) go to the
// Node API; everything else under /api/v1, and /cable, goes to Rails. The list is the only
// place that says which backend owns what, and it is protected (rails-to-node ticket 04).
export const NODE_MARK = '/__node';

type RouteMatcher = (method: string | undefined, pathname: string) => boolean;

export function parsePortedEndpoints(entries: unknown, source: string): RouteMatcher[] {
  if (!Array.isArray(entries)) throw new Error(`${source} must be a JSON array`);

  return entries.map((entry: unknown) => {
    const parsed = typeof entry === 'string' ? /^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/.exec(entry) : null;
    if (!parsed) throw new Error(`${source}: "${String(entry)}" is not "METHOD /path"`);
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

export function loadPortedEndpoints(): RouteMatcher[] {
  const file = path.resolve(__dirname, 'ported-endpoints.json');
  return parsePortedEndpoints(JSON.parse(readFileSync(file, 'utf8')), file);
}

// The URL the request continues with: marked for Node when a listed endpoint matches, the
// same URL otherwise. The query string is not part of the match.
export function markForNode(matchers: RouteMatcher[], method: string | undefined, url: string): string {
  const pathname = url.split('?')[0];
  return matchers.some((matches) => matches(method, pathname)) ? NODE_MARK + url : url;
}

// Vite's proxy picks a target by path only. This middleware runs before it and marks the
// requests Node owns; the proxy's NODE_MARK key strips the mark and forwards them, so
// streaming, errors and headers are still Vite's own proxy's.
export function routePortedEndpointsToNode(): Plugin {
  const matchers = loadPortedEndpoints();
  return {
    name: 'route-ported-endpoints-to-node',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = markForNode(matchers, req.method, req.url ?? '');
        next();
      });
    },
  };
}
