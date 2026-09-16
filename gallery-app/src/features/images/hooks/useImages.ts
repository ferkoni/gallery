import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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

export function useAlbumImages(albumId: number, page: number, filters?: AlbumImageFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['albums', albumId, 'images', page, filters],
    queryFn: () => fetchAlbumImages(albumId, page, filters),
    staleTime: PRESIGNED_URL_STALE_MS,
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

      const prevAlbumPages = queryClient.getQueriesData<PaginatedResponse<Image>>({
        predicate: (q) => q.queryKey[0] === 'albums' && q.queryKey[2] === 'images',
      });
      const prevFavorites = queryClient.getQueryData<ImagePages>(['images', 'favorites']);

      queryClient.setQueriesData<PaginatedResponse<Image>>(
        { predicate: (q) => q.queryKey[0] === 'albums' && q.queryKey[2] === 'images' },
        (old) => {
          if (!old) return old;
          return { ...old, data: old.data.map((img) => img.id === id ? { ...img, favorited } : img) };
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
      queryClient.setQueriesData<PaginatedResponse<Image>>(
        { queryKey: ['albums', albumId, 'images'] },
        (old) => {
          if (!old) return old;
          const newTotalCount = Math.max(0, old.meta.total_count - 1);
          return {
            ...old,
            data: old.data.filter((img) => img.id !== id),
            meta: {
              ...old.meta,
              total_count: newTotalCount,
              total_pages: Math.max(1, Math.ceil(newTotalCount / old.meta.per_page)),
            },
          };
        }
      );
    },
    onSettled: (_data, _err, { albumId }) => {
      queryClient.invalidateQueries({ queryKey: ['albums', albumId, 'images'] });
    },
  });
}
