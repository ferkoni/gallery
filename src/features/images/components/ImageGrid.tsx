import { useImages } from '../hooks/useImages';
import { ImageCard } from './ImageCard';

type Props = { albumId: number };

export function ImageGrid({ albumId }: Props) {
  const { data: images, isPending, isError } = useImages(albumId);

  if (isPending) return <p className="text-gray-500" data-testid="images-loading">Loading images...</p>;
  if (isError) return <p className="text-red-500" data-testid="images-error">Failed to load images.</p>;
  if (!images) return null;

  if (images.length === 0) {
    return (
      <p className="text-gray-400 text-sm mt-4" data-testid="images-empty">
        No images yet. Upload one above.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6" data-testid="image-grid">
      {images.map((image) => (
        <li key={image.id}>
          <ImageCard image={image} />
        </li>
      ))}
    </ul>
  );
}
