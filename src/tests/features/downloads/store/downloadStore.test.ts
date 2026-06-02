import { describe, it, expect, beforeEach } from 'vitest';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';

beforeEach(() => {
  useDownloadStore.setState({ downloads: {} });
});

describe('downloadStore', () => {
  describe('enqueue', () => {
    it('adds an item with pending status', () => {
      useDownloadStore.getState().enqueue(1, 'Summer 2026');

      const { downloads } = useDownloadStore.getState();
      expect(downloads[1]).toMatchObject({ taskId: 1, albumName: 'Summer 2026', status: 'pending' });
    });

    it('supports multiple items keyed by taskId', () => {
      useDownloadStore.getState().enqueue(1, 'Album A');
      useDownloadStore.getState().enqueue(2, 'Album B');

      const { downloads } = useDownloadStore.getState();
      expect(Object.keys(downloads)).toHaveLength(2);
    });
  });

  describe('setReady', () => {
    it('transitions status to ready and sets url', () => {
      useDownloadStore.getState().enqueue(1, 'Summer 2026');
      useDownloadStore.getState().setReady(1, 'https://example.com/file.zip');

      expect(useDownloadStore.getState().downloads[1]).toMatchObject({
        status: 'ready',
        url: 'https://example.com/file.zip',
      });
    });

    it('preserves other fields', () => {
      useDownloadStore.getState().enqueue(1, 'Summer 2026');
      useDownloadStore.getState().setReady(1, 'https://example.com/file.zip');

      expect(useDownloadStore.getState().downloads[1].albumName).toBe('Summer 2026');
    });
  });

  describe('setFailed', () => {
    it('transitions status to failed and sets error', () => {
      useDownloadStore.getState().enqueue(1, 'Summer 2026');
      useDownloadStore.getState().setFailed(1, 'S3 upload failed');

      expect(useDownloadStore.getState().downloads[1]).toMatchObject({
        status: 'failed',
        error: 'S3 upload failed',
      });
    });
  });

  describe('remove', () => {
    it('removes the item with the given taskId', () => {
      useDownloadStore.getState().enqueue(1, 'Summer 2026');
      useDownloadStore.getState().remove(1);

      expect(useDownloadStore.getState().downloads[1]).toBeUndefined();
    });

    it('leaves other items untouched', () => {
      useDownloadStore.getState().enqueue(1, 'Album A');
      useDownloadStore.getState().enqueue(2, 'Album B');
      useDownloadStore.getState().remove(1);

      expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(1);
      expect(useDownloadStore.getState().downloads[2]).toBeDefined();
    });
  });
});
