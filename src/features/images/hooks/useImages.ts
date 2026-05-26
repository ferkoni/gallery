import { useQuery } from '@tanstack/react-query';
import { fetchImages } from '../api/imagesApi';

export function useImages(albumId?: number) {
  return useQuery({
    queryKey: ['images', albumId],
    queryFn: () => fetchImages(albumId),
  });
}
