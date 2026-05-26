import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUpload } from '@/features/images/hooks/useUpload';
import { uploadImage } from '@/features/images/api/imagesApi';
import { useUploadStore } from '@/features/images/store/uploadStore';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/api/imagesApi');
const mockUploadImage = vi.mocked(uploadImage);

const image: Image = {
  id: 1,
  title: 'Beach',
  s3_key: 'albums/1/uuid/photo.jpg',
  album_id: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://signed-url',
};

const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useUpload', () => {
  beforeEach(() => {
    useUploadStore.setState({ queue: [] });
    mockUploadImage.mockReset();
  });

  it('enqueues the item, sets status to done, and calls setProgress on success', async () => {
    mockUploadImage.mockImplementation(async (_file, _title, _albumId, onProgress) => {
      onProgress(75);
      return image;
    });

    const { result } = renderHook(() => useUpload(1), { wrapper: makeWrapper() });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('done');
    expect(item.progress).toBe(75);
    expect(item.albumId).toBe(1);
  });

  it('sets status to error with message when uploadImage rejects', async () => {
    mockUploadImage.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useUpload(1), { wrapper: makeWrapper() });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe('Network error');
  });
});
