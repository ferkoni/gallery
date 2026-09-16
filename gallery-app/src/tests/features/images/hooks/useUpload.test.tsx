import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { useUpload } from '@/features/images/hooks/useUpload';
import { uploadImage } from '@/features/images/api/imagesApi';
import { useUploadStore } from '@/features/images/store/uploadStore';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/api/imagesApi');
const mockUploadImage = vi.mocked(uploadImage);

const image: Image = {
  id: 1,
  title: 'Beach',
  description: null,
  tags: [],
  s3_key: 'images/uuid/photo.jpg',
  album_id: 1,
  favorited: false,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://signed-url',
  thumbnail_url: 'https://signed-thumb-url',
};

const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
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

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('done');
    expect(item.progress).toBe(75);
    expect(item.albumId).toBe(1);
  });

  it('invalidates the correct query key on success', async () => {
    mockUploadImage.mockResolvedValue(image);

    const { queryClient, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['albums', 1, 'images'] });
  });

  it('does not invalidate queries when upload fails', async () => {
    mockUploadImage.mockRejectedValue(new Error('Network error'));

    const { queryClient, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    expect(invalidate).not.toHaveBeenCalled();
  });

  // What the API sends when a write to the user's bucket fails, the original's or
  // the thumbnail's. Before, the queue showed "Request failed with status code 422"
  // for this and for every other rejected upload.
  it("shows the API's message when the upload is rejected", async () => {
    const message = 'Could not save the photo to your S3 bucket. Check your storage settings and try again.';
    mockUploadImage.mockRejectedValue(
      new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422,
        data: { errors: message },
      } as AxiosResponse),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe(message);
  });

  it('shows a generic message when there is no API message, never an internal one', async () => {
    mockUploadImage.mockRejectedValue(new Error('Network error'));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe('Upload failed. Please try again.');
  });
});
