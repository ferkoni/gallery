import { useDownloadAlbum } from '../hooks/useDownloadAlbum';

type Props = {
  albumId: number;
  albumName: string;
  disabled?: boolean;
};

export function DownloadAlbumButton({ albumId, albumName, disabled }: Props) {
  // No inline error: a refusal lands in the download queue, so that a folder the server
  // turns down and a download that fails later look the same to the user.
  const { downloadAlbum, isLoading } = useDownloadAlbum();

  return (
    <button
      onClick={() => downloadAlbum(albumId, albumName)}
      disabled={disabled || isLoading}
      data-testid="download-button"
      className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {isLoading ? 'Starting…' : 'Download Folder'}
    </button>
  );
}
