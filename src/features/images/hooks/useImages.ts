import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchImages,
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

export function useImages(albumId?: number) {
  return useQuery({
    queryKey: ['images', albumId],
    queryFn: () => fetchImages(albumId),
    staleTime: PRESIGNED_URL_STALE_MS,
  });
}

export function useAlbumImages(albumId: number, page: number, filters?: AlbumImageFilters) {
  return useQuery({
    queryKey: ['albums', albumId, 'images', page, filters],
    queryFn: () => fetchAlbumImages(albumId, page, filters),
    staleTime: PRESIGNED_URL_STALE_MS,
  });
}

export function useSearchImages(params: SearchParams) {
  const isEmpty = (v: unknown) => v === undefined || v === '';
  const enabled = !Object.values(params).every(isEmpty);
  return useQuery({
    queryKey: ['images', 'search', params],
    queryFn: () => fetchSearchImages(params),
    staleTime: PRESIGNED_URL_STALE_MS,
    enabled,
  });
}

export function useUpdateImage(albumId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateImagePayload }) =>
      updateImage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums', albumId, 'images'] });
    },
  });
}

export function useFavoriteImages() {
  return useQuery({
    queryKey: ['images', 'favorites'],
    queryFn: fetchFavoriteImages,
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
      const prevFavorites = queryClient.getQueryData<Image[]>(['images', 'favorites']);

      queryClient.setQueriesData<PaginatedResponse<Image>>(
        { predicate: (q) => q.queryKey[0] === 'albums' && q.queryKey[2] === 'images' },
        (old) => {
          if (!old) return old;
          return { ...old, data: old.data.map((img) => img.id === id ? { ...img, favorited } : img) };
        }
      );

      if (!favorited && prevFavorites) {
        queryClient.setQueryData<Image[]>(
          ['images', 'favorites'],
          prevFavorites.filter((img) => img.id !== id),
        );
      } else if (favorited && prevFavorites) {
        const image = prevAlbumPages
          .flatMap(([, page]) => page?.data ?? [])
          .find((img) => img.id === id);
        if (image) {
          queryClient.setQueryData<Image[]>(['images', 'favorites'], [
            ...prevFavorites.filter((img) => img.id !== id),
            { ...image, favorited: true },
          ]);
        }
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
