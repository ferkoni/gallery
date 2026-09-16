import { useCallback, useMemo, useState } from 'react';
import { useAlbumImages } from '../hooks/useImages';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { ImageCard } from './ImageCard';
import { ImageEditModal } from './ImageEditModal';
import { Lightbox } from './Lightbox';
import type { Image } from '../types/image';

type Props = { albumId: number };

export function ImageGrid({ albumId }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modal, setModal] = useState<{ image: Image; mode: 'edit' | 'delete' } | null>(null);

  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');

  const debouncedTitle = useDebounce(title, 300);
  const debouncedTag = useDebounce(tag, 300);
  const debouncedFrom = useDebounce(from, 300);

  const filters = useMemo(() => ({
    title: debouncedTitle || undefined,
    tag: debouncedTag || undefined,
    from: debouncedFrom || undefined,
  }), [debouncedTitle, debouncedTag, debouncedFrom]);

  // A new filter is a new query, so it starts from its own first page. The previous filter's
  // photos stay on screen until it arrives.
  const {
    data: images = [], isPending, isLoadingError, isFetchNextPageError,
    hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage,
  } = useAlbumImages(albumId, filters);

  const clickHandlers = useMemo(() => images.map((_, i) => () => setSelectedIndex(i)), [images]);

  // Below the grid, the last thing on the page, so unlike the subfolder sentinel above it
  // nothing scrolls past it on the way somewhere else. Not while showing the previous filter's
  // photos (the next page would belong to the new filter), and not after a failed page: the
  // failure would re-arm it, and a sentinel still in view would retry in a loop.
  const sentinelRef = useInfiniteSentinel<HTMLDivElement>(
    hasNextPage && !isFetchingNextPage && !isPlaceholderData && !isFetchNextPageError,
    fetchNextPage
  );

  // For the lightbox's Next on the last loaded photo. fetchNextPage restarts a request already
  // in flight, so holding the arrow key would otherwise resend the page on every repeat.
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage) fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return (
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6" data-testid="image-grid-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="bg-skeleton animate-pulse rounded-xl h-48" />
        ))}
      </ul>
    );
  }

  // Only when nothing loaded. A failed later page, or a failed refetch, keeps the photos.
  if (isLoadingError) return <p className="text-danger" data-testid="images-error">Failed to load images.</p>;

  return (
    <>
      <div className="flex gap-3 mt-4 flex-wrap">
        <input
          type="text"
          placeholder="Filter by title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="border border-control rounded-lg px-3 py-2 text-sm flex-1 min-w-32 focus:outline-none focus:ring-2 focus:ring-focus"
        />
        <input
          type="text"
          placeholder="Filter by tag…"
          value={tag}
          onChange={e => setTag(e.target.value)}
          className="border border-control rounded-lg px-3 py-2 text-sm flex-1 min-w-32 focus:outline-none focus:ring-2 focus:ring-focus"
        />
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          className="border border-control rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
        />
      </div>

      {images.length === 0 ? (
        <p className="text-faint text-sm mt-4" data-testid="images-empty">
          No images yet. Upload one above.
        </p>
      ) : (
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
      )}

      {hasNextPage && (
        <div ref={sentinelRef} className="h-4" data-testid="image-grid-sentinel" />
      )}

      {isFetchingNextPage && (
        <p className="text-faint text-sm text-center mt-4" data-testid="image-grid-loading-more">
          Loading more…
        </p>
      )}

      {isFetchNextPageError && (
        <p className="text-danger text-sm text-center mt-4" data-testid="image-grid-load-more-error">
          Couldn't load more photos.{' '}
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="text-link hover:text-link-strong font-medium cursor-pointer"
          >
            Retry
          </button>
        </p>
      )}

      {selectedIndex !== null && (
        <Lightbox
          images={images}
          initialIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          hasMore={hasNextPage}
          onLoadMore={loadMore}
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
