import { useQuery } from '@tanstack/react-query';
import { fetchImages } from '../api/imagesApi';

export function useImages(albumId?: number) {
  return useQuery({
    queryKey: ['images', albumId],
    queryFn: () => fetchImages(albumId),
    staleTime: 50 * 60 * 1000, // 50 min — re-fetch before 1-hour URL expiry
  });
}
