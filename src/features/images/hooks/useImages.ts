import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchImages, fetchAlbumImages, updateImage } from '../api/imagesApi';
import type { UpdateImagePayload } from '../types/image';

const PRESIGNED_URL_STALE_MS = 50 * 60 * 1000;

export function useImages(albumId?: number) {
  return useQuery({
    queryKey: ['images', albumId],
    queryFn: () => fetchImages(albumId),
    staleTime: PRESIGNED_URL_STALE_MS,
  });
}

export function useAlbumImages(albumId: number, page: number) {
  return useQuery({
    queryKey: ['albums', albumId, 'images', page],
    queryFn: () => fetchAlbumImages(albumId, page),
    staleTime: PRESIGNED_URL_STALE_MS,
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
