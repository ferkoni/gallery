import { Link } from 'react-router-dom';
import type { AlbumCrumb } from '@/features/albums/types/album';

// Folders may nest as deep as the user likes, so a long trail collapses in the middle
// rather than wrapping across the page: Folders › Trips › … › Madrid › Day 2.
const KEPT_EACH_END = 1;
const COLLAPSE_OVER = 3;

type Props = {
  ancestors: AlbumCrumb[];
  name: string;
};

export function AlbumBreadcrumbs({ ancestors, name }: Props) {
  const collapsed = ancestors.length > COLLAPSE_OVER;
  const shown = collapsed
    ? [ ...ancestors.slice(0, KEPT_EACH_END), null, ...ancestors.slice(-KEPT_EACH_END) ]
    : ancestors;

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-2" data-testid="album-breadcrumbs">
      <Link to="/folders" className="hover:text-gray-800">Folders</Link>
      {shown.map((crumb, index) => (
        <span key={crumb?.id ?? `gap-${index}`}>
          <span>{' › '}</span>
          {crumb ? (
            <Link
              to={`/folders/${crumb.id}`}
              className="hover:text-gray-800"
              data-testid={`breadcrumb-${crumb.id}`}
            >
              {crumb.name}
            </Link>
          ) : (
            <span data-testid="breadcrumb-ellipsis">…</span>
          )}
        </span>
      ))}
      <span>{' › '}</span>
      <span className="text-gray-700" data-testid="breadcrumb-current">{name}</span>
    </nav>
  );
}
