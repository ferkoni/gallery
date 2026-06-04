import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTaskPoller } from '@/features/downloads/hooks/useTaskPoller';
import { getAsyncTask } from '@/features/downloads/api/asyncTasksApi';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';

vi.mock('@/features/downloads/api/asyncTasksApi');
const mockGetAsyncTask = vi.mocked(getAsyncTask);

beforeEach(() => {
  vi.useFakeTimers();
  useDownloadStore.setState({ downloads: {} });
  mockGetAsyncTask.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTaskPoller', () => {
  it('calls getAsyncTask for each pending task on each tick', async () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
    mockGetAsyncTask.mockResolvedValue({
      id: '1',
      attributes: { status: 'pending', result: {} },
    });

    renderHook(() => useTaskPoller());

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mockGetAsyncTask).toHaveBeenCalledWith(1);
  });

  it('transitions task to ready when API returns ready', async () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
    mockGetAsyncTask.mockResolvedValue({
      id: '1',
      attributes: { status: 'ready', result: { url: 'https://s3.example.com/file.zip' } },
    });

    renderHook(() => useTaskPoller());

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().downloads[1]).toMatchObject({
      status: 'ready',
      url: 'https://s3.example.com/file.zip',
    });
  });

  it('transitions task to failed when API returns failed', async () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
    mockGetAsyncTask.mockResolvedValue({
      id: '1',
      attributes: { status: 'failed', result: { error: 'S3 upload failed' } },
    });

    renderHook(() => useTaskPoller());

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().downloads[1]).toMatchObject({
      status: 'failed',
      error: 'S3 upload failed',
    });
  });

  it('marks task as failed when getAsyncTask throws', async () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
    mockGetAsyncTask.mockRejectedValue(new Error('Network error'));

    renderHook(() => useTaskPoller());

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(useDownloadStore.getState().downloads[1]).toMatchObject({
      status: 'failed',
      error: 'Failed to check download status',
    });
  });

  it('does not call getAsyncTask when there are no pending tasks', async () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
    useDownloadStore.getState().setReady(1, 'https://s3.example.com/file.zip');

    renderHook(() => useTaskPoller());

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mockGetAsyncTask).not.toHaveBeenCalled();
  });

  it('clears the interval on unmount', async () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
    mockGetAsyncTask.mockResolvedValue({
      id: '1',
      attributes: { status: 'pending', result: {} },
    });

    const { unmount } = renderHook(() => useTaskPoller());
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(mockGetAsyncTask).not.toHaveBeenCalled();
  });
});
