import { useParams, Link } from 'react-router-dom';
import { useGetAlbum } from '@/features/albums/albums';
import { ImageGrid } from '../components/ImageGrid';
import { ImageUploadButton } from '../components/ImageUploadButton';

export function AlbumDetailPage() {
  const { id } = useParams();
  const albumId = Number(id);
  const { data: album, isPending, isError } = useGetAlbum(albumId);

  if (isPending) return <p className="p-6 text-gray-500">Loading...</p>;
  if (isError || !album) return <p className="p-6 text-red-500">Failed to load album.</p>;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-gray-800">{album.name}</h1>
        <div className="flex gap-2 items-center">
          <Link
            to={`/albums/${albumId}/edit`}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            data-testid="edit-album-link"
          >
            Edit
          </Link>
          <ImageUploadButton albumId={albumId} />
        </div>
      </div>
      {album.description && (
        <p className="text-gray-500 mb-6">{album.description}</p>
      )}
      <ImageGrid albumId={albumId} />
    </main>
  );
}
