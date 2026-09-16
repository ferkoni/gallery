import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import apiClient from '@/lib/api/client';
import {
  useSearchImages,
  useFavoriteImages,
  useUpdateImage,
  useDeleteImage,
  useFavoriteImage,
  flattenImagePages,
} from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';

const mock = new MockAdapter(apiClient);

afterAll(() => mock.restore());

const images: Image[] = [
  {
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

const photo = (id: number): Image => ({ ...images[0], id, title: `Photo ${id}` });

const meta = (current_page: number, total_pages: number) =>
  ({ current_page, total_pages, total_count: total_pages * 25, per_page: 25 });

const page = (data: Image[], current_page: number, total_pages: number) =>
  ({ data: data.map(attributes => ({ attributes })), meta: meta(current_page, total_pages) });

// Replies by the page param, so a test can load page 1 and then ask for page 2.
function replyByPage(pages: Record<number, ReturnType<typeof page>>) {
  mock.onGet('/images').reply(config => [200, pages[config.params.page as number]]);
}

describe('flattenImagePages', () => {
  it('lists every loaded page in order, each photo once', () => {
    const data = {
      pageParams: [1, 2],
      pages: [
        { data: [photo(1), photo(2)], meta: meta(1, 2) },
        { data: [photo(2), photo(3)], meta: meta(2, 2) },
      ],
    };

    expect(flattenImagePages(data).map(image => image.id)).toEqual([1, 2, 3]);
  });
});

describe('useSearchImages', () => {
  beforeEach(() => mock.reset());

  it('does not search while every param is empty', () => {
    const { result } = renderHook(() => useSearchImages({ q: '', albumId: undefined }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mock.history.get).toHaveLength(0);
  });

  it('loads the next page into one list, and stops at the last page', async () => {
    replyByPage({ 1: page([photo(1), photo(2)], 1, 2), 2: page([photo(3)], 2, 2) });

    const { result } = renderHook(() => useSearchImages({ q: 'lentes' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(image => image.id)).toEqual([1, 2]);
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.map(image => image.id)).toEqual([1, 2, 3]));
    expect(result.current.hasNextPage).toBe(false);
    expect(mock.history.get.map(request => request.params)).toEqual([
      { q: 'lentes', page: 1 },
      { q: 'lentes', page: 2 },
    ]);
  });

  // A photo embedded between two requests shifts every rank after it, so the next page
  // can start with the photo the previous one ended on.
  it('shows a photo returned on both sides of a page boundary once', async () => {
    replyByPage({ 1: page([photo(1), photo(2)], 1, 2), 2: page([photo(2), photo(3)], 2, 2) });

    const { result } = renderHook(() => useSearchImages({ q: 'lentes' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data?.map(image => image.id)).toEqual([1, 2]));
    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.map(image => image.id)).toEqual([1, 2, 3]));
  });
});

describe('useFavoriteImages', () => {
  beforeEach(() => mock.reset());

  it('loads favourites page by page into one list', async () => {
    replyByPage({ 1: page([photo(1)], 1, 2), 2: page([photo(2)], 2, 2) });

    const { result } = renderHook(() => useFavoriteImages(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data?.map(image => image.id)).toEqual([1]));
    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.map(image => image.id)).toEqual([1, 2]));
    expect(result.current.hasNextPage).toBe(false);
    expect(mock.history.get.map(request => request.params)).toEqual([
      { favorited: true, page: 1 },
      { favorited: true, page: 2 },
    ]);
  });
});

describe('useUpdateImage', () => {
  beforeEach(() => mock.reset());

  it('patches the image and returns the updated data on success', async () => {
    const updated: Image = { ...images[0], title: 'New Beach' };
    mock.onPatch('/images/1').reply(200, { data: { attributes: updated } });

    const { result } = renderHook(() => useUpdateImage(1), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, data: { title: 'New Beach' } }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(updated);
  });

  it('enters error state when the server responds with an error', async () => {
    mock.onPatch('/images/1').reply(500);

    const { result } = renderHook(() => useUpdateImage(1), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, data: { title: 'X' } }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  describe('moving a photo between folders', () => {
    // Refetching only the folder it left leaves the destination's grid without it until
    // something else happens to invalidate that cache.
    it('refetches both ends of the move', async () => {
      const moved: Image = { ...images[0], album_id: 2 };
      mock.onPatch('/images/1').reply(200, { data: { attributes: moved } });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateImage(1), { wrapper });
      act(() => { result.current.mutate({ id: 1, data: { album_id: 2 } }); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['albums', 1, 'images'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['albums', 2, 'images'] });
    });

    it('refetches one folder when the photo did not move', async () => {
      const renamed: Image = { ...images[0], title: 'New Beach' };
      mock.onPatch('/images/1').reply(200, { data: { attributes: renamed } });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateImage(1), { wrapper });
      act(() => { result.current.mutate({ id: 1, data: { title: 'New Beach' } }); });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(invalidate).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useDeleteImage', () => {
  beforeEach(() => mock.reset());

  it('sends DELETE to /api/v1/images/:id and enters success state', async () => {
    mock.onDelete('/images/1').reply(204);

    const { result } = renderHook(() => useDeleteImage(), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, albumId: 1 }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mock.history.delete[0].url).toBe('/images/1');
  });

  it('removes the image and updates meta in the cache optimistically', async () => {
    mock.onDelete('/images/1').reply(204);

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
    mock.onDelete('/images/1').reply(204);

    const { result } = renderHook(() => useDeleteImage(), { wrapper: makeWrapper() });
    const onSuccess = vi.fn();

    act(() => { result.current.mutate({ id: 1, albumId: 1 }, { onSuccess }); });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it('enters error state when the server responds with an error', async () => {
    mock.onDelete('/images/1').reply(500);

    const { result } = renderHook(() => useDeleteImage(), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, albumId: 1 }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useFavoriteImage', () => {
  beforeEach(() => mock.reset());

  it('patches the image with the given favorited value', async () => {
    const updated: Image = { ...images[0], favorited: true };
    mock.onPatch('/images/1').reply(200, { data: { attributes: updated } });

    const { result } = renderHook(() => useFavoriteImage(), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, favorited: true }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('enters error state when the server responds with an error', async () => {
    mock.onPatch('/images/1').reply(500);

    const { result } = renderHook(() => useFavoriteImage(), { wrapper: makeWrapper() });

    act(() => { result.current.mutate({ id: 1, favorited: true }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('optimistically flips favorited in album image pages', async () => {
    mock.onPatch('/images/1').reply(200, { data: { attributes: { ...images[0], favorited: true } } });

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

    const { result } = renderHook(() => useFavoriteImage(), { wrapper });

    act(() => { result.current.mutate({ id: 1, favorited: true }); });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{ data: Image[] }>(['albums', 1, 'images', 1]);
      expect(cached?.data[0].favorited).toBe(true);
    });
  });

  describe('the favourites list, cached as pages', () => {
    const favourites = () => ({
      pageParams: [1, 2],
      pages: [
        { data: [photo(1), photo(2)].map(image => ({ ...image, favorited: true })), meta: meta(1, 2) },
        { data: [photo(3)].map(image => ({ ...image, favorited: true })), meta: meta(2, 2) },
      ],
    });

    function setup() {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      queryClient.setQueryData(['images', 'favorites'], favourites());
      const cachedIds = () =>
        queryClient.getQueryData<ReturnType<typeof favourites>>(['images', 'favorites'])
          ?.pages.map(p => p.data.map(image => image.id));
      return { wrapper, cachedIds };
    }

    it('removes an unfavourited photo from whichever page holds it', async () => {
      mock.onPatch('/images/3').reply(() => new Promise(() => {}));
      const { wrapper, cachedIds } = setup();

      const { result } = renderHook(() => useFavoriteImage(), { wrapper });
      act(() => { result.current.mutate({ id: 3, favorited: false }); });

      await waitFor(() => expect(cachedIds()).toEqual([[1, 2], []]));
    });

    // The list is ordered by upload date, so the photo's place may be on a page that is not
    // loaded. The refetch after the mutation settles puts it where the server says.
    it('adds nothing to the cache when a photo is favourited', async () => {
      mock.onPatch('/images/9').reply(() => new Promise(() => {}));
      const { wrapper, cachedIds } = setup();

      const { result } = renderHook(() => useFavoriteImage(), { wrapper });
      act(() => { result.current.mutate({ id: 9, favorited: true }); });

      await waitFor(() => expect(result.current.isPending).toBe(true));
      expect(cachedIds()).toEqual([[1, 2], [3]]);
    });

    it('puts the photo back when the server refuses', async () => {
      mock.onPatch('/images/1').reply(500);
      const { wrapper, cachedIds } = setup();

      const { result } = renderHook(() => useFavoriteImage(), { wrapper });
      act(() => { result.current.mutate({ id: 1, favorited: false }); });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(cachedIds()).toEqual([[1, 2], [3]]);
    });
  });
});
