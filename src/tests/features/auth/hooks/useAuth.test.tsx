import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthContext } from '@/features/auth/context/AuthContext';
import { loginRequest } from '@/features/auth/api/authApi';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { AxiosResponse } from 'axios';

vi.mock('@/features/auth/api/authApi');
const mockLoginRequest = vi.mocked(loginRequest);

function makeWrapper(loginFn = vi.fn(), setS3CredentialConfiguredFn = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {mutations: {retry: false}},
  });
  return {
    loginFn,
    setS3CredentialConfiguredFn,
    wrapper: ({children}: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{
          token: null,
          login: loginFn,
          logout: vi.fn(),
          s3CredentialConfigured: false,
          setS3CredentialConfigured: setS3CredentialConfiguredFn
        }}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    ),
  };
}

describe('useAuth', () => {
  beforeEach(() => mockLoginRequest.mockReset());

  it('throws when used outside AuthProvider', () => {
    const queryClient = new QueryClient();
    const wrapper = ({children}: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    // suppress React's error boundary console output
    vi.spyOn(console, 'error').mockImplementation(() => {
    });
    expect(() => renderHook(() => useAuth(), {wrapper}))
      .toThrow('useAuth must be used inside AuthProvider');
    vi.restoreAllMocks();
  });

  const mockResponse = (token: string, s3CredentialConfigured: boolean) => ({
    data: {
      token,
      user: { data: { attributes: { s3_credential_configured: s3CredentialConfigured } } }
    }
  } as AxiosResponse);

  it('calls loginRequest with email and password', async () => {
    mockLoginRequest.mockResolvedValue(mockResponse('abc', false));
    const {wrapper} = makeWrapper();
    const {result} = renderHook(() => useAuth(), {wrapper});

    act(() => result.current.loginMutation.mutate({email: 'a@b.com', password: 'secret'}));

    await waitFor(() => expect(result.current.loginMutation.isSuccess).toBe(true));
    expect(mockLoginRequest).toHaveBeenCalledWith('a@b.com', 'secret');
  });

  it('calls context login with the token on success', async () => {
    mockLoginRequest.mockResolvedValue(mockResponse('xyz789', false));
    const {wrapper, loginFn} = makeWrapper();
    const {result} = renderHook(() => useAuth(), {wrapper});

    act(() => result.current.loginMutation.mutate({email: 'a@b.com', password: 'secret'}));

    await waitFor(() => expect(loginFn).toHaveBeenCalledWith('xyz789'));
  });

  it('calls setS3CredentialConfigured with the value from the response', async () => {
    mockLoginRequest.mockResolvedValue(mockResponse('xyz789', true));
    const {wrapper, setS3CredentialConfiguredFn} = makeWrapper();
    const {result} = renderHook(() => useAuth(), {wrapper});

    act(() => result.current.loginMutation.mutate({email: 'a@b.com', password: 'secret'}));

    await waitFor(() => expect(setS3CredentialConfiguredFn).toHaveBeenCalledWith(true));
  });
});