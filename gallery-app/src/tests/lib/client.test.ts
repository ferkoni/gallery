import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { getToken, setToken } from '@/lib/api/tokenStore';

const mock = new MockAdapter(apiClient);

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
