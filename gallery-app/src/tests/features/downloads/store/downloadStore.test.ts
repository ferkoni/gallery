import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';

beforeEach(() => {
  useDownloadStore.setState({ downloads: {} });
});

describe('downloadStore', () => {
  describe('enqueue', () => {
    it('adds an item with pending status', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');

      const { downloads } = useDownloadStore.getState();
      expect(downloads[1]).toMatchObject({ taskId: 1, albumName: 'Summer 2026', status: 'pending' });
    });

    it('supports multiple items keyed by taskId', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Album A');
      useDownloadStore.getState().enqueue(2, 20, 'Album B');

      const { downloads } = useDownloadStore.getState();
      expect(Object.keys(downloads)).toHaveLength(2);
    });
  });

  describe('setReady', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('transitions status to ready and sets url', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
      useDownloadStore.getState().setReady(1, 'https://example.com/file.zip');

      expect(useDownloadStore.getState().downloads[1]).toMatchObject({
        status: 'ready',
        url: 'https://example.com/file.zip',
        readyAt: '2026-01-15',
      });
    });

    it('preserves other fields', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
      useDownloadStore.getState().setReady(1, 'https://example.com/file.zip');

      expect(useDownloadStore.getState().downloads[1].albumName).toBe('Summer 2026');
    });

    it('is a no-op for an unknown taskId', () => {
      useDownloadStore.getState().setReady(999, 'https://example.com/file.zip');
      expect(useDownloadStore.getState().downloads[999]).toBeUndefined();
    });
  });

  describe('setFailed', () => {
    it('transitions status to failed and sets error', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
      useDownloadStore.getState().setFailed(1, 'S3 upload failed');

      expect(useDownloadStore.getState().downloads[1]).toMatchObject({
        status: 'failed',
        error: 'S3 upload failed',
      });
    });

    it('is a no-op for an unknown taskId', () => {
      useDownloadStore.getState().setFailed(999, 'some error');
      expect(useDownloadStore.getState().downloads[999]).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('removes the item with the given taskId', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Summer 2026');
      useDownloadStore.getState().remove(1);

      expect(useDownloadStore.getState().downloads[1]).toBeUndefined();
    });

    it('leaves other items untouched', () => {
      useDownloadStore.getState().enqueue(1, 10, 'Album A');
      useDownloadStore.getState().enqueue(2, 20, 'Album B');
      useDownloadStore.getState().remove(1);

      expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(1);
      expect(useDownloadStore.getState().downloads[2]).toBeDefined();
    });
  });
});
