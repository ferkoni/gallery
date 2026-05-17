import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthProvider } from "@/features/auth/components/AuthProvider.tsx";
import { AuthContext } from '@/features/auth/context/AuthContext';

// Helper: a component that exposes context values for assertions
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
    vi.restoreAllMocks();
  });

  it('provides null token when localStorage is empty', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    expect(screen.getByTestId('token').textContent).toBe('null');
  });

  it('rehydrates token from localStorage on mount', () => {
    localStorage.setItem('token', 'stored-token');
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    expect(screen.getByTestId('token').textContent).toBe('stored-token');
  });

  it('login sets token in state and localStorage', () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    act(() => screen.getByText('login').click());
    expect(screen.getByTestId('token').textContent).toBe('abc123');
    expect(localStorage.getItem('token')).toBe('abc123');
  });

  it('logout clears token from state and localStorage', () => {
    localStorage.setItem('token', 'abc123');
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    act(() => screen.getByText('logout').click());
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('renders children', () => {
    render(<AuthProvider><span>child</span></AuthProvider>);
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});