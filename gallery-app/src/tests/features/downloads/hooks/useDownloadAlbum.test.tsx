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
});
