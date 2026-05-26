import type { Image } from '../types/image';

type Props = { image: Image };

export function ImageCard({ image }: Props) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden" data-testid={`image-card-${image.id}`}>
      <img src={image.url} alt={image.title} className="w-full h-48 object-cover" />
      <div className="p-3">
        <p className="text-sm font-medium text-gray-700 truncate">{image.title}</p>
      </div>
    </div>
  );
}
