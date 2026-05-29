import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import { useImages, useUpdateImage, useDeleteImage } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';

const mock = new MockAdapter(apiClient);

afterAll(() => mock.restore());

const images: Image[] = [
  {
    id: 1,
    title: 'Beach',
    description: null,
    tags: [],
    s3_key: 'albums/1/uuid/photo.jpg',
    album_id: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    url: 'https://signed-url',
  },
];

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useImages', () => {
  beforeEach(() => mock.reset());

  it('returns images for the given albumId', async () => {
    mock.onGet('/api/images').reply(200, { data: [{ attributes: images[0] }] });

    const { result } = renderHook(() => useImages(1), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(images);
    expect(mock.history.get[0].params).toEqual({ album_id: 1 });
  });

  it('returns an error state when the server responds with an error', async () => {
    mock.onGet('/api/images').reply(500);

    const { result } = renderHook(() => useImages(1), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateImage', () => {
  beforeEach(() => mock.reset());

  it('patches the image and returns the updated data on success', async () => {
    const updated: Image = { ...images[0], title: 'New Beach' };
    mock.onPatch('/api/images/1').reply(200, { data: { attributes: updated } });

    const { result } = renderHook(() => useUpdateImage(1), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, data: { title: 'New Beach' } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(updated);
  });

  it('enters error state when the server responds with an error', async () => {
    mock.onPatch('/api/images/1').reply(500);

    const { result } = renderHook(() => useUpdateImage(1), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, data: { title: 'X' } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useDeleteImage', () => {
  beforeEach(() => mock.reset());

  it('sends DELETE to /api/images/:id and enters success state', async () => {
    mock.onDelete('/api/images/1').reply(204);

    const { result } = renderHook(() => useDeleteImage(), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, albumId: 1 }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mock.history.delete[0].url).toBe('/api/images/1');
  });

  it('removes the image and updates meta in the cache optimistically', async () => {
    mock.onDelete('/api/images/1').reply(204);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    queryClient.setQueryData(['albums', 1, 'images', 1], {
      data: [images[0]],
      meta: { current_page: 1, total_pages: 1, total_count: 1, per_page: 25 },
    });

    const { result } = renderHook(() => useDeleteImage(), { wrapper });

    act(() => { result.current.mutate({ id: 1, albumId: 1 }); });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{ data: typeof images; meta: { total_count: number } }>(
        ['albums', 1, 'images', 1]
      );
      expect(cached?.data).toHaveLength(0);
      expect(cached?.meta.total_count).toBe(0);
    });
  });

  it('calls onSuccess callback after successful delete', async () => {
    mock.onDelete('/api/images/1').reply(204);

    const { result } = renderHook(() => useDeleteImage(), { wrapper: makeWrapper() });
    const onSuccess = vi.fn();

    act(() => { result.current.mutate({ id: 1, albumId: 1 }, { onSuccess }); });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it('enters error state when the server responds with an error', async () => {
    mock.onDelete('/api/images/1').reply(500);

    const { result } = renderHook(() => useDeleteImage(), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, albumId: 1 }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
