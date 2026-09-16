import { Link } from 'react-router-dom';
import { CardEditButton } from '@/components/CardEditButton';
import type { Album } from '@/features/albums/types/album';

type Props = {
  album: Album;
  onEdit: (album: Album) => void;
};

// Shared by the top-level list and by the subfolder section of a folder's own page, so a
// folder looks the same wherever it is shown.
export function AlbumCard({ album, onEdit }: Props) {
  return (
    <li
      className="relative group bg-surface rounded-xl shadow p-4"
      data-testid={`album-card-${album.id}`}
    >
      <Link
        to={`/folders/${album.id}`}
        className="absolute inset-0 rounded-xl"
        aria-label={album.name}
      />
      <h2 className="font-semibold text-strong" data-testid={`album-name-${album.id}`}>{album.name}</h2>
      {album.description && (
        <p className="text-sm text-muted mt-1" data-testid={`album-description-${album.id}`}>{album.description}</p>
      )}
      <CardEditButton
        onClick={() => onEdit(album)}
        aria-label="Edit folder"
        data-testid={`edit-album-button-${album.id}`}
      />
    </li>
  );
}
