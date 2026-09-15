import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDownloadAlbum } from '@/features/downloads/hooks/useDownloadAlbum';
import { createDownloadTask } from '@/features/downloads/api/asyncTasksApi';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';
import { AxiosError } from 'axios';

// A 422 shaped the way the API explains a refusal.
function refusal(message: string) {
  const err = new AxiosError('Request failed with status code 422');
  err.response = { status: 422, data: { errors: message } } as never;
  return err;
}

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

  it('returns false when createDownloadTask throws', async () => {
    mockCreateDownloadTask.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDownloadAlbum());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.downloadAlbum(5, 'Summer 2026'); });

    expect(ok).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  // The refusal goes to the download queue rather than beside the button, so that a folder
  // the server turns down and a download that fails later look the same to the user.
  describe('a refusal that never became a task', () => {
    it("queues the folder as failed, carrying the server's own sentence", async () => {
      mockCreateDownloadTask.mockRejectedValue(refusal('Album has no images'));

      const { result } = renderHook(() => useDownloadAlbum());
      await act(() => result.current.downloadAlbum(5, 'Summer 2026'));

      const item = Object.values(useDownloadStore.getState().downloads)[0];
      expect(item).toMatchObject({
        albumId: 5, albumName: 'Summer 2026', status: 'failed', error: 'Album has no images',
      });
    });

    it('falls back to a fixed sentence when the failure explains nothing', async () => {
      mockCreateDownloadTask.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useDownloadAlbum());
      await act(() => result.current.downloadAlbum(5, 'Summer 2026'));

      const item = Object.values(useDownloadStore.getState().downloads)[0];
      expect(item.error).toBe('Failed to start download');
    });
  });
});
