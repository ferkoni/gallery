import { useFavoriteImages } from '../hooks/useImages';
import { ImageCard } from '../components/ImageCard';

export function FavoritesPage() {
  const { data: images, isPending, isError } = useFavoriteImages();

  if (isPending) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Favorites</h1>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4" data-testid="favorites-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="bg-gray-200 animate-pulse rounded-xl h-48" />
          ))}
        </ul>
      </main>
    );
  }

  if (isError) return <p className="p-6 text-red-500">Failed to load favorites.</p>;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Favorites</h1>
      {images.length === 0 ? (
        <p className="text-gray-400 text-sm" data-testid="favorites-empty">
          No favorites yet. Click the heart on any image.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4" data-testid="favorites-grid">
          {images.map((image) => (
            <li key={image.id}>
              <ImageCard image={image} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
