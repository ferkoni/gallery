import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDownloadAlbum } from '@/features/downloads/hooks/useDownloadAlbum';
import { createDownloadTask } from '@/features/downloads/api/asyncTasksApi';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';

vi.mock('@/features/downloads/api/asyncTasksApi');
const mockCreateDownloadTask = vi.mocked(createDownloadTask);

beforeEach(() => {
  useDownloadStore.setState({ downloads: {} });
  mockCreateDownloadTask.mockReset();
});

describe('useDownloadAlbum', () => {
  it('calls createDownloadTask with the given albumId', async () => {
    mockCreateDownloadTask.mockResolvedValue({ task_id: 42 });

    const { result } = renderHook(() => useDownloadAlbum());
    await act(() => result.current.downloadAlbum(5, 'Summer 2026'));

    expect(mockCreateDownloadTask).toHaveBeenCalledWith(5);
  });

  it('enqueues a pending toast with the returned task_id', async () => {
    mockCreateDownloadTask.mockResolvedValue({ task_id: 42 });

    const { result } = renderHook(() => useDownloadAlbum());
    await act(() => result.current.downloadAlbum(5, 'Summer 2026'));

    const { downloads } = useDownloadStore.getState();
    expect(downloads[42]).toMatchObject({
      taskId: 42,
      albumId: 5,
      albumName: 'Summer 2026',
      status: 'pending',
    });
  });

  it('enqueues separate toasts for multiple calls', async () => {
    mockCreateDownloadTask
      .mockResolvedValueOnce({ task_id: 1 })
      .mockResolvedValueOnce({ task_id: 2 });

    const { result } = renderHook(() => useDownloadAlbum());
    await act(async () => {
      await result.current.downloadAlbum(1, 'Album A');
      await result.current.downloadAlbum(2, 'Album B');
    });

    const { downloads } = useDownloadStore.getState();
    expect(Object.keys(downloads)).toHaveLength(2);
  });

  it('returns true on success', async () => {
    mockCreateDownloadTask.mockResolvedValue({ task_id: 42 });

    const { result } = renderHook(() => useDownloadAlbum());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.downloadAlbum(5, 'Summer 2026'); });

    expect(ok).toBe(true);
  });

  it('sets isLoading to true while the request is in-flight and false after', async () => {
    let resolve: (v: { task_id: number }) => void;
    mockCreateDownloadTask.mockReturnValue(new Promise<{ task_id: number }>((r) => { resolve = r; }));

    const { result } = renderHook(() => useDownloadAlbum());

    let promise: Promise<boolean>;
    act(() => { promise = result.current.downloadAlbum(5, 'Summer 2026'); });
    expect(result.current.isLoading).toBe(true);

    await act(async () => { resolve!({ task_id: 1 }); await promise; });
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error and returns false when createDownloadTask throws', async () => {
    mockCreateDownloadTask.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDownloadAlbum());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.downloadAlbum(5, 'Summer 2026'); });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Failed to start download');
    expect(result.current.isLoading).toBe(false);
  });

  it('clears error on a subsequent successful call', async () => {
    mockCreateDownloadTask
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ task_id: 99 });

    const { result } = renderHook(() => useDownloadAlbum());
    await act(() => result.current.downloadAlbum(5, 'Summer 2026'));
    expect(result.current.error).toBe('Failed to start download');

    await act(() => result.current.downloadAlbum(5, 'Summer 2026'));
    expect(result.current.error).toBeNull();
  });

  it('does not enqueue when createDownloadTask throws', async () => {
    mockCreateDownloadTask.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDownloadAlbum());
    await act(() => result.current.downloadAlbum(5, 'Summer 2026'));

    expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(0);
  });
});
