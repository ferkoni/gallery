import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchImages, fetchAlbumImages, updateImage } from '../api/imagesApi';
import type { UpdateImagePayload } from '../types/image';

export function useImages(albumId?: number) {
  return useQuery({
    queryKey: ['images', albumId],
    queryFn: () => fetchImages(albumId),
    staleTime: 50 * 60 * 1000, // 50 min — re-fetch before 1-hour URL expiry
  });
}

export function useAlbumImages(albumId: number, page: number) {
  return useQuery({
    queryKey: ['albums', albumId, 'images', page],
    queryFn: () => fetchAlbumImages(albumId, page),
    staleTime: 50 * 60 * 1000, // 50 min — re-fetch before 1-hour URL expiry
  });
}

export function useUpdateImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateImagePayload }) =>
      updateImage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });
}
