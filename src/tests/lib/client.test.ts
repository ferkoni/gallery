import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import apiClient from '@/lib/api/client';

const mock = new MockAdapter(apiClient);

describe('apiClient interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    mock.reset();
    mock.onGet('/test').reply(200);
  });

  afterAll(() => mock.restore());

  it('adds Authorization header when token is in localStorage', async () => {
    localStorage.setItem('token', 'abc123');
    await apiClient.get('/test');
    expect(mock.history.get[0].headers?.Authorization).toBe('Bearer abc123');
  });

  it('omits Authorization header when no token in localStorage', async () => {
    await apiClient.get('/test');
    expect(mock.history.get[0].headers?.Authorization).toBeUndefined();
  });
});