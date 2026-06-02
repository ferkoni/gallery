import { useDownloadAlbum } from '../hooks/useDownloadAlbum';

type Props = {
  albumId: number;
  albumName: string;
  disabled?: boolean;
};

export function DownloadAlbumButton({ albumId, albumName, disabled }: Props) {
  const { downloadAlbum } = useDownloadAlbum();

  return (
    <button
      onClick={() => downloadAlbum(albumId, albumName)}
      disabled={disabled}
      data-testid="download-button"
      className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      Download Album
    </button>
  );
}
