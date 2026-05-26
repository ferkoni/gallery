import { useQuery } from '@tanstack/react-query';
import { fetchImageUrl } from '../api/imagesApi';
import type { Image } from '../types/image';

type Props = { image: Image };

export function ImageCard({ image }: Props) {
  const { data: url, isPending, isError } = useQuery({
    queryKey: ['image-url', image.id],
    queryFn: () => fetchImageUrl(image.id),
    staleTime: 50 * 60 * 1000, // 50 min — URL valid for 1 hour
  });

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden" data-testid={`image-card-${image.id}`}>
      {isPending && (
        <div className="w-full h-48 bg-gray-100 animate-pulse" data-testid="image-loading" />
      )}
      {isError && (
        <div className="w-full h-48 bg-red-50 flex items-center justify-center" data-testid="image-error">
          <p className="text-sm text-red-400">Failed to load</p>
        </div>
      )}
      {url && (
        <img src={url} alt={image.title} className="w-full h-48 object-cover" />
      )}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-700 truncate">{image.title}</p>
      </div>
    </div>
  );
}
