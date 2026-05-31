import { memo, useState } from 'react';
import type { Image } from '../types/image';
import { useFavoriteImage } from '../hooks/useImages';

type Props = {
  image: Image;
  onClick?: () => void;
  onUnfavorite?: (image: Image) => void;
};

export const ImageCard = memo(function ImageCard({ image, onClick, onUnfavorite }: Props) {
  const [broken, setBroken] = useState(false);
  const { mutate: toggleFavorite, isPending } = useFavoriteImage();

  const uploadDate = new Date(image.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div
      className="relative group bg-white rounded-xl shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      data-testid={`image-card-${image.id}`}
      onClick={onClick}
    >
      <button
        data-testid="favorite-button"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          const next = !image.favorited;
          toggleFavorite({ id: image.id, favorited: next });
          if (!next) onUnfavorite?.(image);
        }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/80 hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
        aria-label={image.favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill={image.favorited ? '#ef4444' : 'none'}
            stroke={image.favorited ? '#ef4444' : '#9ca3af'}
            strokeWidth="2"
          />
        </svg>
      </button>
      {broken ? (
        <div
          className="w-full h-48 bg-gray-100 flex items-center justify-center"
          data-testid="image-broken"
        >
          <span className="text-gray-400 text-sm">Image unavailable</span>
        </div>
      ) : (
        <img
          src={image.url}
          alt={image.title}
          className="w-full h-48 object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-700 truncate">{image.title}</p>
        <p className="text-xs text-gray-400 mt-0.5" data-testid={`image-date-${image.id}`}>{uploadDate}</p>
      </div>
    </div>
  );
});
