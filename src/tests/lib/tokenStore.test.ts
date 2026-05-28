import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken } from '@/lib/api/tokenStore';

describe('tokenStore', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns null when no token is set', () => {
    expect(getToken()).toBeNull();
  });

  it('returns the token after setToken', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
  });

  it('persists to sessionStorage', () => {
    setToken('abc123');
    expect(sessionStorage.getItem('authToken')).toBe('abc123');
  });

  it('removes the token from sessionStorage on setToken(null)', () => {
    setToken('abc123');
    setToken(null);
    expect(sessionStorage.getItem('authToken')).toBeNull();
  });

  it('returns null after setToken(null)', () => {
    setToken('abc123');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});
