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

  // The lock the upload queue relies on: a claim is one synchronous set(), so an item can be
  // claimed once, and never while `limit` are already running.
  describe('claimNext', () => {
    const add = (id: string) => useUploadStore.getState().enqueue(id, { file, title: id, albumId: 1 });
    const claim = (limit = 2) => useUploadStore.getState().claimNext(limit);
    const statuses = () => useUploadStore.getState().queue.map((i) => i.status);

    it('claims waiting items in the order they were added, and marks them uploading', () => {
      ['a', 'b', 'c'].forEach(add);

      expect(claim()?.id).toBe('a');
      expect(claim()?.id).toBe('b');
      expect(statuses()).toEqual(['uploading', 'uploading', 'pending']);
    });

    it('claims nothing while the limit is running, and the next one once a slot frees', () => {
      ['a', 'b', 'c'].forEach(add);
      claim();
      claim();

      expect(claim()).toBeNull();
      useUploadStore.getState().setStatus('a', 'done');
      expect(claim()?.id).toBe('c');
    });

    it('skips finished and failed items, and returns null when nothing waits', () => {
      ['a', 'b'].forEach(add);
      useUploadStore.getState().setStatus('a', 'error', 'Too large');
      useUploadStore.getState().setStatus('b', 'done');

      expect(claim()).toBeNull();
      expect(statuses()).toEqual(['error', 'done']);
    });

    it('never hands out the same item twice', () => {
      add('a');

      expect(claim(5)?.id).toBe('a');
      expect(claim(5)).toBeNull();
    });
  });
});
