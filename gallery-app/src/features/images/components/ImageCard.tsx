import { memo, useState } from 'react';
import type { Image } from '../types/image';
import { useFavoriteImage } from '../hooks/useImages';

// Given only by the folder grid, so Search and Favorites render exactly as before.
type Selection = {
  selected: boolean;
  showCheckbox: boolean;                               // true once anything is selected
  onToggle: (image: Image, shiftKey: boolean) => void; // stable, from ImageGrid
};

type Props = {
  image: Image;
  onClick?: () => void;
  onUnfavorite?: (image: Image) => void;
  selection?: Selection;
};

export const ImageCard = memo(function ImageCard({ image, onClick, onUnfavorite, selection }: Props) {
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
      className={`relative group bg-surface rounded-xl shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow${
        selection?.selected ? ' ring-2 ring-focus' : ''
      }`}
      data-testid={`image-card-${image.id}`}
      onClick={onClick}
    >
      {selection && (
        // Hidden until the card is hovered or focused, and shown on every card once anything
        // is selected, so the selection is visible without hunting for it.
        <label
          className={`absolute top-2 left-2 z-10 p-1.5 rounded-full bg-surface/80 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
            selection.showCheckbox ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="block cursor-pointer accent-blue-500"
            aria-label={`Select ${image.title}`}
            checked={selection.selected}
            // Shift-click extends from the last card clicked. The change event carries the
            // modifier because a click is what produced it.
            onChange={(e) => selection.onToggle(image, (e.nativeEvent as MouseEvent).shiftKey)}
          />
        </label>
      )}
      <button
        data-testid="favorite-button"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          const next = !image.favorited;
          toggleFavorite({ id: image.id, favorited: next });
          if (!next) onUnfavorite?.(image);
        }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-surface/80 hover:bg-surface transition-colors disabled:opacity-50 cursor-pointer"
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
          className="w-full h-48 bg-sunken flex items-center justify-center"
          data-testid="image-broken"
        >
          <span className="text-faint text-sm">Image unavailable</span>
        </div>
      ) : (
        <img
          src={image.thumbnail_url}
          alt={image.title}
          className="w-full h-48 object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
      <div className={`p-3${selection?.selected ? ' bg-selected' : ''}`}>
        <p className="text-sm font-medium text-body truncate">{image.title}</p>
        <p className="text-xs text-faint mt-0.5" data-testid={`image-date-${image.id}`}>{uploadDate}</p>
      </div>
    </div>
  );
});
