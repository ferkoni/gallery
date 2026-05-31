import { useCallback, useEffect, useRef, useState } from 'react';
import { useFavoriteImages, useFavoriteImage } from '../hooks/useImages';
import { ImageCard } from '../components/ImageCard';
import { UndoToast } from '../components/UndoToast';
import type { Image } from '../types/image';

const UNDO_TIMEOUT_MS = 7000; // 7 seconds

export function FavoritesPage() {
  const { data: images, isPending, isError } = useFavoriteImages();
  const { mutate: toggleFavorite } = useFavoriteImage();
  const [undoImage, setUndoImage] = useState<Image | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearUndo = useCallback(() => {
    setUndoImage(null);
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const handleUnfavorite = useCallback((image: Image) => {
    clearTimeout(timerRef.current);
    setUndoImage(image);
    timerRef.current = setTimeout(clearUndo, UNDO_TIMEOUT_MS);
  }, [clearUndo]);

  const handleUndo = useCallback(() => {
    if (!undoImage) return;
    toggleFavorite({ id: undoImage.id, favorited: true });
    clearUndo();
  }, [undoImage, toggleFavorite, clearUndo]);

  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

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
    <>
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
                <ImageCard image={image} onUnfavorite={handleUnfavorite} />
              </li>
            ))}
          </ul>
        )}
      </main>
      {undoImage && (
        <UndoToast
          message="Removed from favorites"
          onUndo={handleUndo}
          onDismiss={clearUndo}
        />
      )}
    </>
  );
}
