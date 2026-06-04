import { useParams } from 'react-router-dom';
import { useGetAlbum } from '@/features/albums/albums';
import { ImageGrid } from '../components/ImageGrid';
import { ImageUploadButton } from '../components/ImageUploadButton';
import { useAlbumImages } from '../hooks/useImages';
import { DownloadAlbumButton } from '@/features/downloads/components/DownloadAlbumButton';

export function AlbumDetailPage() {
  const { id } = useParams();
  const albumId = id ? Number(id) : 0;
  const { data: album, isPending, isError } = useGetAlbum(albumId, { enabled: !!id });
  const { data: imagesData } = useAlbumImages(albumId, 1, undefined, { enabled: !!id });

  if (!id) return <p className="p-6 text-red-500">Invalid album.</p>;
  if (isPending) return <p className="p-6 text-gray-500">Loading...</p>;
  if (isError || !album) return <p className="p-6 text-red-500">Failed to load album.</p>;

  const hasImages = (imagesData?.meta.total_count ?? 0) > 0;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-gray-800">{album.name}</h1>
        <div className="flex gap-2 items-center">
          <DownloadAlbumButton albumId={albumId} albumName={album.name} disabled={!hasImages} />
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
