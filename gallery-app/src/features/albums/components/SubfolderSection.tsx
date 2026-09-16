import { useState } from 'react';
import { useInfiniteAlbums } from '@/features/albums/albums';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { AlbumCard } from '@/features/albums/components/AlbumCard';
import { AlbumEditModal } from '@/features/albums/components/AlbumEditModal';
import type { Album } from '@/features/albums/types/album';

// The sentinel sits above the photo grid, so scrolling down to the photos drags it
// through the viewport. Left unchecked that cascades a request per page of the whole
// subfolder list; after this many automatic loads the rest is asked for by hand.
const AUTOMATIC_PAGES = 3;

type Props = { albumId: number };

export function SubfolderSection({ albumId }: Props) {
  const [editing, setEditing] = useState<Album | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteAlbums({ parentId: albumId });

  const pages = data?.pages ?? [];
  const albums = pages.flatMap(page => page.data);

  const automatic = pages.length < AUTOMATIC_PAGES;
  const sentinelRef = useInfiniteSentinel<HTMLDivElement>(
    automatic && hasNextPage && !isFetchingNextPage,
    fetchNextPage
  );

  // A folder with no subfolders shows no section at all, rather than an empty heading.
  if (albums.length === 0) return null;

  return (
    <section className="mb-8" data-testid="subfolder-section">
      <h2 className="text-sm font-semibold text-muted mb-3">Folders</h2>
      <ul className="grid grid-cols-2 gap-4">
        {albums.map(album => (
          <AlbumCard key={album.id} album={album} onEdit={setEditing} />
        ))}
      </ul>

      {hasNextPage && (
        automatic ? (
          <div ref={sentinelRef} className="h-4" data-testid="subfolder-sentinel" />
        ) : (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="mt-3 text-sm text-link hover:text-link-strong cursor-pointer"
            data-testid="subfolder-show-more"
          >
            Show more folders
          </button>
        )
      )}

      {editing && <AlbumEditModal album={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
