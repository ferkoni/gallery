import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { getToken, setToken } from '@/lib/api/tokenStore';

const mock = new MockAdapter(apiClient);

// The version is written in the client and nowhere else, so call sites say '/albums'
// (docs: api-versioning/02, decision 6).
describe('apiClient base URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sends requests under /api/v1 on the same origin when VITE_API_URL is empty', () => {
    expect(apiClient.getUri({ url: '/albums' })).toBe('/api/v1/albums');
  });

  it('puts /api/v1 after the origin that VITE_API_URL names', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
    vi.resetModules();
    const { default: client } = await import('@/lib/api/client');

    expect(client.getUri({ url: '/albums' })).toBe('http://localhost:3000/api/v1/albums');
  });
});

describe('apiClient request interceptor', () => {
  beforeEach(() => {
    setToken(null);
    mock.reset();
    mock.onGet('/test').reply(200);
  });

  afterEach(() => setToken(null));

  it('adds Authorization header when token is set', async () => {
    setToken('abc123');
    await apiClient.get('/test');
    expect(mock.history.get[0].headers?.Authorization).toBe('Bearer abc123');
  });

  it('omits Authorization header when no token is set', async () => {
    await apiClient.get('/test');
    expect(mock.history.get[0].headers?.Authorization).toBeUndefined();
  });
});

describe('apiClient 401 response interceptor', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { replace: vi.fn() },
    });
  });

  beforeEach(() => {
    setToken(null);
    mock.reset();
    mock.onGet('/test').reply(401);
    vi.mocked(window.location.replace).mockClear();
  });

  afterEach(() => setToken(null));

  afterAll(() => mock.restore());

  it('clears the token on 401 response', async () => {
    setToken('abc123');
    await apiClient.get('/test').catch(() => {});
    expect(getToken()).toBeNull();
  });

  it('redirects to /login on 401 response', async () => {
    await apiClient.get('/test').catch(() => {});
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('rejects the promise on 401 response', async () => {
    await expect(apiClient.get('/test')).rejects.toThrow();
  });
});
