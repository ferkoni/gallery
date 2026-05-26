import { describe, it, expect, beforeEach } from 'vitest';
import { useUploadStore } from '@/features/images/store/uploadStore';

const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  useUploadStore.setState({ queue: [] });
});

describe('uploadStore', () => {
  describe('enqueue', () => {
    it('adds an item with pending status and 0 progress', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });

      const { queue } = useUploadStore.getState();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({ id: 'id-1', title: 'Beach', albumId: 1, progress: 0, status: 'pending' });
    });
  });

  describe('setProgress', () => {
    it('updates progress for the matching id', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
      useUploadStore.getState().setProgress('id-1', 60);

      expect(useUploadStore.getState().queue[0].progress).toBe(60);
    });

    it('does not affect other items', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'A', albumId: 1 });
      useUploadStore.getState().enqueue('id-2', { file, title: 'B', albumId: 1 });
      useUploadStore.getState().setProgress('id-1', 80);

      expect(useUploadStore.getState().queue[1].progress).toBe(0);
    });
  });

  describe('setStatus', () => {
    it('updates status for the matching id', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
      useUploadStore.getState().setStatus('id-1', 'uploading');

      expect(useUploadStore.getState().queue[0].status).toBe('uploading');
    });

    it('sets error message when provided', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
      useUploadStore.getState().setStatus('id-1', 'error', 'Network error');

      const item = useUploadStore.getState().queue[0];
      expect(item.status).toBe('error');
      expect(item.error).toBe('Network error');
    });
  });

  describe('remove', () => {
    it('removes the item with the given id', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
      useUploadStore.getState().remove('id-1');

      expect(useUploadStore.getState().queue).toHaveLength(0);
    });

    it('leaves other items untouched', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'A', albumId: 1 });
      useUploadStore.getState().enqueue('id-2', { file, title: 'B', albumId: 1 });
      useUploadStore.getState().remove('id-1');

      expect(useUploadStore.getState().queue).toHaveLength(1);
      expect(useUploadStore.getState().queue[0].id).toBe('id-2');
    });
  });

  describe('clearCompleted', () => {
    it('removes only done items and keeps the rest', () => {
      useUploadStore.getState().enqueue('id-1', { file, title: 'A', albumId: 1 });
      useUploadStore.getState().enqueue('id-2', { file, title: 'B', albumId: 1 });
      useUploadStore.getState().enqueue('id-3', { file, title: 'C', albumId: 1 });
      useUploadStore.getState().setStatus('id-1', 'done');
      useUploadStore.getState().setStatus('id-3', 'done');

      useUploadStore.getState().clearCompleted();

      const { queue } = useUploadStore.getState();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('id-2');
    });
  });
});
