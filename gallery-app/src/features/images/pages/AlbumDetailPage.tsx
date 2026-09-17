import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import { AlbumBreadcrumbs } from '@/features/albums/components/AlbumBreadcrumbs';
import { SubfolderSection } from '@/features/albums/components/SubfolderSection';
import { ImageGrid } from '../components/ImageGrid';
import { ImageUploadButton } from '../components/ImageUploadButton';
import { useAlbumImageCount, useMoveImages } from '../hooks/useImages';
import { UndoToast } from '../components/UndoToast';
import { useSelectionStore } from '../store/selectionStore';
import { apiErrorMessage } from '@/lib/api/errorMessage';
import { DownloadAlbumButton } from '@/features/downloads/components/DownloadAlbumButton';

const UNDO_TIMEOUT_MS = 7000; // 7 seconds

export function AlbumDetailPage() {
  const { id } = useParams();
  const albumId = id ? Number(id) : 0;
  const { data: album, isPending, isError } = useGetAlbum(albumId, { enabled: !!id });
  // The folder's own photos, unfiltered. The same cache entry as the grid's while it has no filter.
  const { data: imageCount } = useAlbumImageCount(albumId, { enabled: !!id });
  // The same query SubfolderSection runs, so react-query serves both from one request.
  const { data: subfolders } = useInfiniteAlbums({ parentId: albumId });

  const lastMove = useSelectionStore((s) => s.lastMove);
  const setLastMove = useSelectionStore((s) => s.setLastMove);
  const reset = useSelectionStore((s) => s.reset);
  // A second error slot, because Undo runs outside the dialog and has nowhere else to report a
  // failure (docs: select-and-move/02, decision 12).
  const [moveError, setMoveError] = useState<string | null>(null);
  const { mutate: move } = useMoveImages();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismissUndo = useCallback(() => {
    setLastMove(null);
    clearTimeout(timerRef.current);
  }, [setLastMove]);

  const undo = useCallback(() => {
    if (!lastMove) return;
    const { ids, from, to } = lastMove;
    dismissUndo();
    // The reverse move, in one call. Its own success records nothing, so there's no toast
    // offering to redo it.
    move(
      { ids, from: to.id, to: { id: from, name: '' }, isUndo: true },
      { onError: (err) => setMoveError(apiErrorMessage(err, "Couldn't move the photos. Try again.")) }
    );
  }, [lastMove, dismissUndo, move]);

  // Restarted whenever a new move replaces the last, so the pill always shows for its full 7 s.
  useEffect(() => {
    if (!lastMove) return;
    timerRef.current = setTimeout(() => setLastMove(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(timerRef.current);
  }, [lastMove, setLastMove]);

  // Leaving the folder, or switching to another one, drops the selection and the toast: its
  // Undo names a folder that is no longer on screen.
  useEffect(() => () => reset(), [albumId, reset]);

  if (!id) return <p className="p-6 text-danger">Invalid folder.</p>;
  if (isPending) return <p className="p-6 text-muted">Loading...</p>;
  if (isError || !album) return <p className="p-6 text-danger">Failed to load folder.</p>;

  const hasImages = (imageCount ?? 0) > 0;
  const hasSubfolders = (subfolders?.pages[0]?.data.length ?? 0) > 0;
  // Only a folder with neither photos nor subfolders is pointless to download. One whose
  // subfolders are all empty still looks downloadable and is not; that refusal is the
  // server's, and it arrives in the download queue. Held back until both queries have
  // answered, so the button does not flash disabled while they load.
  const knowsWhatItHolds = imageCount !== undefined && subfolders !== undefined;
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

      {lastMove && (
        <UndoToast
          message={`Moved ${lastMove.ids.length} photo${lastMove.ids.length === 1 ? '' : 's'} to ${lastMove.to.name}`}
          onUndo={undo}
          onDismiss={dismissUndo}
        />
      )}

      {moveError && !lastMove && (
        <UndoToast message={moveError} onDismiss={() => setMoveError(null)} />
      )}
    </main>
  );
}
