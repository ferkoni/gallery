import { Link, useParams } from 'react-router-dom';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import { AlbumBreadcrumbs } from '@/features/albums/components/AlbumBreadcrumbs';
import { SubfolderSection } from '@/features/albums/components/SubfolderSection';
import { ImageGrid } from '../components/ImageGrid';
import { ImageUploadButton } from '../components/ImageUploadButton';
import { useAlbumImages } from '../hooks/useImages';
import { DownloadAlbumButton } from '@/features/downloads/components/DownloadAlbumButton';

export function AlbumDetailPage() {
  const { id } = useParams();
  const albumId = id ? Number(id) : 0;
  const { data: album, isPending, isError } = useGetAlbum(albumId, { enabled: !!id });
  const { data: imagesData } = useAlbumImages(albumId, 1, undefined, { enabled: !!id });
  // The same query SubfolderSection runs, so react-query serves both from one request.
  const { data: subfolders } = useInfiniteAlbums({ parentId: albumId });

  if (!id) return <p className="p-6 text-danger">Invalid folder.</p>;
  if (isPending) return <p className="p-6 text-muted">Loading...</p>;
  if (isError || !album) return <p className="p-6 text-danger">Failed to load folder.</p>;

  const hasImages = (imagesData?.meta.total_count ?? 0) > 0;
  const hasSubfolders = (subfolders?.pages[0]?.data.length ?? 0) > 0;
  // Only a folder with neither photos nor subfolders is pointless to download. One whose
  // subfolders are all empty still looks downloadable and is not; that refusal is the
  // server's, and it arrives in the download queue. Held back until both queries have
  // answered, so the button does not flash disabled while they load.
  const knowsWhatItHolds = imagesData !== undefined && subfolders !== undefined;
  const nothingToDownload = knowsWhatItHolds && !hasImages && !hasSubfolders;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <AlbumBreadcrumbs ancestors={album.ancestors ?? []} name={album.name} />

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-strong">{album.name}</h1>
        <div className="flex gap-2 items-center">
          <Link
            to={`/folders/new?parent=${albumId}`}
            className="text-sm px-3 py-2 rounded-lg border border-control text-secondary hover:bg-hover transition-colors"
            data-testid="new-subfolder-link"
          >
            New folder here
          </Link>
          <DownloadAlbumButton albumId={albumId} albumName={album.name} disabled={nothingToDownload} />
          <ImageUploadButton albumId={albumId} />
        </div>
      </div>
      {album.description && (
        <p className="text-muted mb-6">{album.description}</p>
      )}

      {/* Subfolders before photos, as everywhere else folders and photos sit together. */}
      <SubfolderSection albumId={albumId} />
      <ImageGrid albumId={albumId} />
    </main>
  );
}
