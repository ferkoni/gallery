import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUnsubscribe, mockDisconnect, getReceived, setReceived } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn();
  const mockDisconnect = vi.fn();
  let received: ((data: unknown) => void) = () => {};
  return {
    mockUnsubscribe,
    mockDisconnect,
    getReceived: () => received,
    setReceived: (fn: (data: unknown) => void) => { received = fn; },
  };
});

vi.mock('@rails/actioncable', () => ({
  createConsumer: vi.fn(() => ({
    subscriptions: {
      create: vi.fn((_channel: string, handlers: { received: (data: unknown) => void }) => {
        setReceived(handlers.received);
        return { unsubscribe: mockUnsubscribe };
      }),
    },
    disconnect: mockDisconnect,
  })),
}));

vi.mock('@/features/auth/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

import { useUserChannel } from '@/features/downloads/hooks/useUserChannel';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';
import { createConsumer } from '@rails/actioncable';
import { useAuthContext } from '@/features/auth/hooks/useAuthContext';

const mockCreateConsumer = vi.mocked(createConsumer);
const mockUseAuthContext = vi.mocked(useAuthContext);

function makeAuthContext(token: string | null) {
  return {
    token,
    login: vi.fn(),
    logout: vi.fn(),
    s3CredentialConfigured: false,
    setS3CredentialConfigured: vi.fn(),
  };
}

beforeEach(() => {
  useDownloadStore.setState({ downloads: {} });
  mockUnsubscribe.mockReset();
  mockDisconnect.mockReset();
  mockCreateConsumer.mockClear();
  mockUseAuthContext.mockReturnValue(makeAuthContext('test-token'));
});

describe('useUserChannel', () => {
  it('creates a consumer with the JWT token in the URL', () => {
    renderHook(() => useUserChannel());
    expect(mockCreateConsumer).toHaveBeenCalledWith('/cable?token=test-token');
  });

  it('does not create a consumer when token is null', () => {
    mockUseAuthContext.mockReturnValue(makeAuthContext(null));
    renderHook(() => useUserChannel());
    expect(mockCreateConsumer).not.toHaveBeenCalled();
  });

  it('subscribes to UserChannel', () => {
    renderHook(() => useUserChannel());
    const consumer = mockCreateConsumer.mock.results[0].value;
    expect(consumer.subscriptions.create).toHaveBeenCalledWith('UserChannel', expect.any(Object));
  });

  it('sets task to ready when a ready message is received', () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    renderHook(() => useUserChannel());

    act(() => {
      getReceived()({
        task_type: 'album_download',
        task_id: 1,
        status: 'ready',
        album_name: 'Summer',
        url: 'https://example.com/file.zip',
      });
    });

    expect(useDownloadStore.getState().downloads[1]).toMatchObject({
      status: 'ready',
      url: 'https://example.com/file.zip',
    });
  });

  it('sets task to failed when a failed message is received', () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    renderHook(() => useUserChannel());

    act(() => {
      getReceived()({
        task_type: 'album_download',
        task_id: 1,
        status: 'failed',
        album_name: 'Summer',
      });
    });

    expect(useDownloadStore.getState().downloads[1]).toMatchObject({
      status: 'failed',
      error: 'Download failed',
    });
  });

  it('ignores messages with a different task_type', () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    renderHook(() => useUserChannel());

    act(() => {
      getReceived()({
        task_type: 'other_task',
        task_id: 1,
        status: 'ready',
        url: 'https://example.com/file.zip',
      });
    });

    expect(useDownloadStore.getState().downloads[1].status).toBe('pending');
  });

  it('ignores a ready message that has no url', () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    renderHook(() => useUserChannel());

    act(() => {
      getReceived()({
        task_type: 'album_download',
        task_id: 1,
        status: 'ready',
        album_name: 'Summer',
      });
    });

    expect(useDownloadStore.getState().downloads[1].status).toBe('pending');
  });

  it('unsubscribes and disconnects on unmount', () => {
    const { unmount } = renderHook(() => useUserChannel());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('reconnects when the token changes', () => {
    mockUseAuthContext.mockReturnValue(makeAuthContext(null));
    const { rerender } = renderHook(() => useUserChannel());
    expect(mockCreateConsumer).not.toHaveBeenCalled();

    mockUseAuthContext.mockReturnValue(makeAuthContext('new-token'));
    rerender();

    expect(mockCreateConsumer).toHaveBeenCalledWith('/cable?token=new-token');
  });
});
