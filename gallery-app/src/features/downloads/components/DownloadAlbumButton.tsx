import { useDownloadAlbum } from '../hooks/useDownloadAlbum';

type Props = {
  albumId: number;
  albumName: string;
  disabled?: boolean;
};

export function DownloadAlbumButton({ albumId, albumName, disabled }: Props) {
  const { downloadAlbum, isLoading, error } = useDownloadAlbum();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => downloadAlbum(albumId, albumName)}
        disabled={disabled || isLoading}
        data-testid="download-button"
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {isLoading ? 'Starting…' : 'Download Album'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
