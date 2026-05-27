import { useState } from 'react';
import { usePagedListAlbum } from '@/features/albums/albums';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { Link, useNavigate } from "react-router-dom";
import { AlbumEditModal } from '@/features/albums/components/AlbumEditModal';
import type { Album } from '@/features/albums/types/album';

export function AlbumListPage() {
  const { page, goNext, goPrev } = usePagination();
  const { data, isPending, isError } = usePagedListAlbum(page);
  const navigate = useNavigate();
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);

  if (isPending) return <p className="p-6 text-gray-500" data-testid="loading-label">Loading...</p>;
  if (isError) return <p className="p-6 text-red-500" data-testid="failed-label">Failed to load albums.</p>;

  const albums = data.data;
  const meta = data.meta;

  return (
    <>
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Albums</h1>
          <Link
            to="/albums/new"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            data-testid="album-new-link"
          >
            + New Album
          </Link>
        </div>

        {albums.length === 0 ? (
          <p className="text-gray-500" data-testid="no-album-label">No albums yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4">
            {albums.map(album => (
              <li
                key={album.id}
                className="relative group bg-white rounded-xl shadow p-4 cursor-pointer"
                data-testid={`album-card-${album.id}`}
                onClick={() => { navigate(`/albums/${album.id}`); }}
              >
                <h2 className="font-semibold text-gray-800" data-testid={`album-name-${album.id}`}>{album.name}</h2>
                {album.description && (
                  <p className="text-sm text-gray-500 mt-1" data-testid={`album-description-${album.id}`}>{album.description}</p>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingAlbum(album); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white/80 hover:bg-white text-gray-600 hover:text-gray-900 rounded-full p-1.5 shadow transition-all"
                  aria-label="Edit album"
                  data-testid={`edit-album-button-${album.id}`}
                >
                  ✏
                </button>
              </li>
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
