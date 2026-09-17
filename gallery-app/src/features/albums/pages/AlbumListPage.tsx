import { useState } from 'react';
import { useInfiniteAlbums } from '@/features/albums/albums';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { Link } from "react-router-dom";
import { AlbumEditModal } from '@/features/albums/components/AlbumEditModal';
import { AlbumCard } from '@/features/albums/components/AlbumCard';
import type { Album } from '@/features/albums/types/album';

export function AlbumListPage() {
  // No parent: the bare index is the top level of the tree. The same query the folder picker
  // runs when it opens at the top, so the two share a cache entry.
  const {
    data, isPending, isLoadingError, isFetchNextPageError, hasNextPage, isFetchingNextPage, fetchNextPage,
  } = useInfiniteAlbums({});
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);

  // Below the list, the last thing on the page. Not after a failed page: the failure would
  // re-arm it, and a sentinel still in view would retry in a loop.
  const sentinelRef = useInfiniteSentinel<HTMLDivElement>(
    hasNextPage && !isFetchingNextPage && !isFetchNextPageError,
    fetchNextPage
  );

  if (isPending) return <p className="p-6 text-muted" data-testid="loading-label">Loading...</p>;
  // Only when nothing loaded. A failed later page, or a failed refetch, keeps the folders.
  if (isLoadingError) return <p className="p-6 text-danger" data-testid="failed-label">Failed to load folders.</p>;

  const albums = data.pages.flatMap(page => page.data);

  return (
    <>
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-strong">Folders</h1>
          <Link
            to="/folders/new"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            data-testid="album-new-link"
          >
            + New Folder
          </Link>
        </div>

        {albums.length === 0 ? (
          <p className="text-muted" data-testid="no-album-label">No folders yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4">
            {albums.map(album => (
              <AlbumCard key={album.id} album={album} onEdit={setEditingAlbum} />
            ))}
          </ul>
        )}

        {hasNextPage && (
          <div ref={sentinelRef} className="h-4" data-testid="album-list-sentinel" />
        )}

        {isFetchingNextPage && (
          <p className="text-faint text-sm text-center mt-4" data-testid="album-list-loading-more">
            Loading more…
          </p>
        )}

        {isFetchNextPageError && (
          <p className="text-danger text-sm text-center mt-4" data-testid="album-list-load-more-error">
            Couldn't load more folders.{' '}
            <button
              type="button"
              onClick={() => fetchNextPage()}
              className="text-link hover:text-link-strong font-medium cursor-pointer"
            >
              Retry
            </button>
          </p>
        )}
      </main>

      {editingAlbum && (
        <AlbumEditModal
          album={editingAlbum}
          onClose={() => setEditingAlbum(null)}
        />
      )}
    </>
  );
}
