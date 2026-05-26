import { useState } from 'react';
import type { Image } from '../types/image';

type Props = {
  image: Image;
  onClick?: () => void;
};

export function ImageCard({ image, onClick }: Props) {
  const [broken, setBroken] = useState(false);

  const uploadDate = new Date(image.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div
      className="bg-white rounded-xl shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      data-testid={`image-card-${image.id}`}
      onClick={onClick}
    >
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
          onError={() => setBroken(true)}
        />
      )}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-700 truncate">{image.title}</p>
        <p className="text-xs text-gray-400 mt-0.5" data-testid={`image-date-${image.id}`}>{uploadDate}</p>
      </div>
    </div>
  );
}
