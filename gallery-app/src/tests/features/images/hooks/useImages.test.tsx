import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import apiClient from '@/lib/api/client';
import { useImages } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';

const mock = new MockAdapter(apiClient);

afterAll(() => mock.restore());

const images: Image[] = [
  { id: 1, title: 'Beach', s3_key: 'albums/1/uuid/photo.jpg', album_id: 1, created_at: '2026-01-01T00:00:00.000Z', url: 'https://signed-url' },
];

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
