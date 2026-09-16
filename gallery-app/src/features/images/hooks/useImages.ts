import { infiniteQueryOptions, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import {
  fetchAlbumImages,
  fetchFavoriteImages,
  fetchSearchImages,
  updateImage,
  deleteImage,
} from '../api/imagesApi';
import type { SearchParams, AlbumImageFilters } from '../api/imagesApi';
import type { Image, UpdateImagePayload } from '../types/image';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';

const PRESIGNED_URL_STALE_MS = 50 * 60 * 1000;

type ImagePages = InfiniteData<PaginatedResponse<Image>>;

export function nextImagePage(last: PaginatedResponse<Image>) {
  return last.meta.current_page < last.meta.total_pages ? last.meta.current_page + 1 : undefined;
}

// One list out of every loaded page, each photo once. Every page request runs the query
// again on the server, so a photo indexed or favourited between two requests shifts the
// rows after it, and the same photo can come back on both sides of a page boundary.
export function flattenImagePages(data: ImagePages): Image[] {
  const seen = new Set<number>();
  return data.pages
    .flatMap(page => page.data)
    .filter(image => !seen.has(image.id) && seen.add(image.id));
}

// The folder grid and the download guard read one cache entry: the key is the same whenever
// the grid has no filters, because a filters object whose values are all undefined hashes like
// {}. Pages live inside the entry, so every key under ['albums', id, 'images'] has the
// { pages } shape, and the optimistic updaters below only handle that one.
export const albumImagesQuery = (albumId: number, filters: AlbumImageFilters = {}) =>
  infiniteQueryOptions({
    queryKey: ['albums', albumId, 'images', filters],
    queryFn: ({ pageParam }) => fetchAlbumImages(albumId, pageParam, filters),
    initialPageParam: 1,
    getNextPageParam: nextImagePage,
    staleTime: PRESIGNED_URL_STALE_MS,
  });

export function useAlbumImages(albumId: number, filters?: AlbumImageFilters) {
  return useInfiniteQuery({
    ...albumImagesQuery(albumId, filters),
    select: flattenImagePages,
    // A filter change is a new key; without this the grid would blank for each round trip.
    placeholderData: keepPreviousData,
  });
}

// The folder's own photo count, unfiltered. The grid's first page can't answer this while a
// filter is set, because its total_count is the filtered one.
export function useAlbumImageCount(albumId: number, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    ...albumImagesQuery(albumId),
    select: (data) => data.pages[0].meta.total_count,
    enabled: options?.enabled ?? true,
  });
}

export function useSearchImages(params: SearchParams) {
  const isEmpty = (v: unknown) => v === undefined || v === '';
  const enabled = !Object.values(params).every(isEmpty);
  return useInfiniteQuery({
    queryKey: ['images', 'search', params],
    queryFn: ({ pageParam }) => fetchSearchImages(params, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextImagePage,
    select: flattenImagePages,
    // Every debounced keystroke is a new key with no cache entry. Without this the results
    // would blank for each round trip and refill.
    placeholderData: keepPreviousData,
    staleTime: PRESIGNED_URL_STALE_MS,
    enabled,
  });
}

export function useUpdateImage(albumId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateImagePayload }) =>
      updateImage(id, data),
    // Both ends of a move. Invalidating only the folder the photo came from left the
    // destination's grid without it until something else happened to refetch.
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['albums', albumId, 'images'] });
      if (updated.album_id !== albumId) {
        queryClient.invalidateQueries({ queryKey: ['albums', updated.album_id, 'images'] });
      }
    },
  });
}

export function useFavoriteImages() {
  return useInfiniteQuery({
    queryKey: ['images', 'favorites'],
    queryFn: ({ pageParam }) => fetchFavoriteImages(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextImagePage,
    select: flattenImagePages,
    staleTime: PRESIGNED_URL_STALE_MS,
  });
}

export function useFavoriteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorited }: { id: number; favorited: boolean }) =>
      updateImage(id, { favorited }),
    onMutate: async ({ id, favorited }) => {
      await queryClient.cancelQueries({
        predicate: (q) =>
          (q.queryKey[0] === 'albums' && q.queryKey[2] === 'images') ||
          (q.queryKey[0] === 'images' && q.queryKey[1] === 'favorites'),
      });

      const prevAlbumPages = queryClient.getQueriesData<ImagePages>({
        predicate: (q) => q.queryKey[0] === 'albums' && q.queryKey[2] === 'images',
      });
      const prevFavorites = queryClient.getQueryData<ImagePages>(['images', 'favorites']);

      queryClient.setQueriesData<ImagePages>(
        { predicate: (q) => q.queryKey[0] === 'albums' && q.queryKey[2] === 'images' },
        (old) => old && {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((img) => img.id === id ? { ...img, favorited } : img),
          })),
        }
      );

      // Unfavouriting removes the photo from whichever loaded page holds it. Favouriting
      // adds nothing: the list is ordered by upload date, so the photo belongs somewhere in
      // the middle, possibly on a page not loaded yet. The invalidation in onSettled puts it
      // where the server says.
      if (!favorited && prevFavorites) {
        queryClient.setQueryData<ImagePages>(['images', 'favorites'], {
          ...prevFavorites,
          pages: prevFavorites.pages.map((page) => ({
            ...page,
            data: page.data.filter((img) => img.id !== id),
          })),
        });
      }

      return { prevAlbumPages, prevFavorites };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prevAlbumPages?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (ctx?.prevFavorites !== undefined) {
        queryClient.setQueryData(['images', 'favorites'], ctx.prevFavorites);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'albums' && q.queryKey[2] === 'images',
      });
      queryClient.invalidateQueries({ queryKey: ['images', 'favorites'] });
      queryClient.invalidateQueries({ queryKey: ['images', 'search'] });
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; albumId: number }) => deleteImage(id),
    onMutate: async ({ id, albumId }) => {
      await queryClient.cancelQueries({ queryKey: ['albums', albumId, 'images'] });
      queryClient.setQueriesData<ImagePages>(
        { queryKey: ['albums', albumId, 'images'] },
        (old) => old && {
          ...old,
          pages: old.pages.map((page) => ({
            data: page.data.filter((img) => img.id !== id),
            // Every page carries the count, and the download guard reads the first: deleting
            // a folder's last photo greys out Download without waiting for the refetch.
            meta: { ...page.meta, total_count: Math.max(0, page.meta.total_count - 1) },
          })),
        }
      );
    },
    onSettled: (_data, _err, { albumId }) => {
      queryClient.invalidateQueries({ queryKey: ['albums', albumId, 'images'] });
    },
  });
}
