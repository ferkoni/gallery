import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthProvider } from "@/features/auth/components/AuthProvider.tsx";
import { AuthContext } from '@/features/auth/context/AuthContext';
import { getToken, setToken } from '@/lib/api/tokenStore';

function TestConsumer() {
  const { token, login, logout } = useContext(AuthContext)!;
  return (
    <>
      <span data-testid="token">{token ?? 'null'}</span>
      <button onClick={() => login('abc123')}>login</button>
      <button onClick={logout}>logout</button>
    </>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setToken(null);
    vi.restoreAllMocks();
  });

  afterEach(() => setToken(null));

  it('provides null token on initial render', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    expect(screen.getByTestId('token').textContent).toBe('null');
  });

  it('login sets token in state and tokenStore', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    act(() => screen.getByText('login').click());
    expect(screen.getByTestId('token').textContent).toBe('abc123');
    expect(getToken()).toBe('abc123');
  });

  it('logout clears token from state and tokenStore', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    act(() => screen.getByText('login').click());
    act(() => screen.getByText('logout').click());
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect(getToken()).toBeNull();
  });

  it('restores token from sessionStorage on mount', () => {
    setToken('persisted');
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    expect(screen.getByTestId('token').textContent).toBe('persisted');
  });

  it('renders children', () => {
    render(<AuthProvider><span>child</span></AuthProvider>);
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
