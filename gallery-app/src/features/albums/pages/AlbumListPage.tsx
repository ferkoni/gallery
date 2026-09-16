import { useState } from 'react';
import { usePagedListAlbum } from '@/features/albums/albums';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { Link } from "react-router-dom";
import { AlbumEditModal } from '@/features/albums/components/AlbumEditModal';
import { AlbumCard } from '@/features/albums/components/AlbumCard';
import type { Album } from '@/features/albums/types/album';

export function AlbumListPage() {
  const { page, goNext, goPrev } = usePagination();
  // The bare index is the top level of the tree, so this page needs no parent of its own.
  const { data, isPending, isError } = usePagedListAlbum(page);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);

  if (isPending) return <p className="p-6 text-gray-500" data-testid="loading-label">Loading...</p>;
  if (isError) return <p className="p-6 text-red-500" data-testid="failed-label">Failed to load folders.</p>;

  const albums = data.data;
  const meta = data.meta;

  return (
    <>
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Folders</h1>
          <Link
            to="/folders/new"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            data-testid="album-new-link"
          >
            + New Folder
          </Link>
        </div>

        {albums.length === 0 ? (
          <p className="text-gray-500" data-testid="no-album-label">No folders yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4">
            {albums.map(album => (
              <AlbumCard key={album.id} album={album} onEdit={setEditingAlbum} />
            ))}
          </ul>
        )}

        <Pagination
          currentPage={meta.current_page}
          totalPages={meta.total_pages}
          onNext={goNext}
          onPrev={goPrev}
        />
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
