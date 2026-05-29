import { useEffect, useMemo, useState } from 'react';
import { useAlbumImages } from '../hooks/useImages';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { ImageCard } from './ImageCard';
import { ImageEditModal } from './ImageEditModal';
import { Lightbox } from './Lightbox';
import type { Image } from '../types/image';

type Props = { albumId: number };

export function ImageGrid({ albumId }: Props) {
  const { page, goNext, goPrev, reset } = usePagination();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modal, setModal] = useState<{ image: Image; mode: 'edit' | 'delete' } | null>(null);

  useEffect(() => { reset(); }, [albumId, reset]);

  const { data, isPending, isError } = useAlbumImages(albumId, page);

  const images = useMemo(() => data?.data ?? [], [data?.data]);
  const clickHandlers = useMemo(() => images.map((_, i) => () => setSelectedIndex(i)), [images]);

  if (isPending) {
    return (
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6" data-testid="image-grid-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="bg-gray-200 animate-pulse rounded-xl h-48" />
        ))}
      </ul>
    );
  }

  if (isError) return <p className="text-red-500" data-testid="images-error">Failed to load images.</p>;

  const meta = data.meta;

  if (images.length === 0) {
    return (
      <p className="text-gray-400 text-sm mt-4" data-testid="images-empty">
        No images yet. Upload one above.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6" data-testid="image-grid">
        {images.map((image, index) => (
          <li key={image.id}>
            <ImageCard
              image={image}
              onClick={clickHandlers[index]}
            />
          </li>
        ))}
      </ul>

      <Pagination
        currentPage={meta.current_page}
        totalPages={meta.total_pages}
        onNext={goNext}
        onPrev={goPrev}
      />

      {selectedIndex !== null && (
        <Lightbox
          images={images}
          initialIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
        >
          <Lightbox.Overlay />
          <Lightbox.Image />
          <Lightbox.Meta />
          <Lightbox.Nav />
          <Lightbox.Close />
          <Lightbox.Menu
            onEdit={(image) => { setSelectedIndex(null); setModal({ image, mode: 'edit' }); }}
            onDelete={(image) => { setSelectedIndex(null); setModal({ image, mode: 'delete' }); }}
          />
        </Lightbox>
      )}

      {modal && (
        <ImageEditModal
          image={modal.image}
          initialMode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
