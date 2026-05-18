import { useListAlbum } from '@/features/albums/albums';
import { Link } from "react-router-dom";

export function AlbumGrid() {
  const { data: albums, isPending, isError } = useListAlbum();

  if (isPending) return <p className="p-6 text-gray-500">Loading...</p>;
  if (isError) return <p className="p-6 text-red-500">Failed to load albums.</p>;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Albums</h1>
        <Link
          to="/albums/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Album
        </Link>
      </div>

      {albums.length === 0 ? (
        <p className="text-gray-500">No albums yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4">
          {albums.map(album => (
            <li key={album.id} className="bg-white rounded-xl shadow p-4">
              <h2 className="font-semibold text-gray-800">{album.name}</h2>
              {album.description && (
                <p className="text-sm text-gray-500 mt-1">{album.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}