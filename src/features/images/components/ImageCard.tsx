import { useState } from 'react';
import type { Image } from '../types/image';

type Props = { image: Image };

export function ImageCard({ image }: Props) {
  const [broken, setBroken] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden" data-testid={`image-card-${image.id}`}>
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
      </div>
    </div>
  );
}
