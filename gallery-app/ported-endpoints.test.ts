// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPortedEndpoints, markForNode, NODE_MARK, parsePortedEndpoints } from './ported-endpoints';

const SOURCE = 'ported-endpoints.json';
const route = (entries: string[], method: string, url: string) =>
  markForNode(parsePortedEndpoints(entries, SOURCE), method, url);

describe('ported endpoints: which requests go to Node', () => {
  it('sends a listed method and path to Node, marked', () => {
    expect(route(['GET /health'], 'GET', '/health')).toBe(`${NODE_MARK}/health`);
  });

  it('leaves an unlisted path for Rails, unchanged', () => {
    expect(route(['GET /health'], 'GET', '/api/v1/albums')).toBe('/api/v1/albums');
  });

  it('leaves the same path with another method for Rails', () => {
    expect(route(['GET /api/v1/albums'], 'POST', '/api/v1/albums')).toBe('/api/v1/albums');
  });

  it('matches the whole path, not a prefix or a suffix', () => {
    const entries = ['GET /api/v1/albums'];
    expect(route(entries, 'GET', '/api/v1/albums/7')).toBe('/api/v1/albums/7');
    expect(route(entries, 'GET', '/x/api/v1/albums')).toBe('/x/api/v1/albums');
  });

  it('matches a :placeholder against exactly one segment', () => {
    const entries = ['PATCH /api/v1/albums/:id'];
    expect(route(entries, 'PATCH', '/api/v1/albums/7')).toBe(`${NODE_MARK}/api/v1/albums/7`);
    expect(route(entries, 'PATCH', '/api/v1/albums/7/images')).toBe('/api/v1/albums/7/images');
    expect(route(entries, 'PATCH', '/api/v1/albums/')).toBe('/api/v1/albums/');
  });

  it('treats the other characters of a path literally', () => {
    expect(route(['GET /api/v1/a.b'], 'GET', '/api/v1/aXb')).toBe('/api/v1/aXb');
  });

  it('ignores the query string when matching, and keeps it', () => {
    expect(route(['GET /api/v1/images'], 'GET', '/api/v1/images?q=cat')).toBe(`${NODE_MARK}/api/v1/images?q=cat`);
  });

  it('rejects a list that is not an array', () => {
    expect(() => parsePortedEndpoints({ 'GET /health': true }, SOURCE)).toThrow(`${SOURCE} must be a JSON array`);
  });

  it('rejects an entry that is not "METHOD /path"', () => {
    for (const entry of ['get /health', 'GET health', 'GET  /health', 'HEAD /health', 42]) {
      expect(() => parsePortedEndpoints([entry], SOURCE)).toThrow(`is not "METHOD /path"`);
    }
  });

  it('routes GET /health to Node with the committed list', () => {
    expect(markForNode(loadPortedEndpoints(), 'GET', '/health')).toBe(`${NODE_MARK}/health`);
  });
});
