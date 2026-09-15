import { Navigate, useParams } from 'react-router-dom';

// <Navigate> cannot interpolate a route param itself, so the redirect from the old
// /albums/:id URLs needs a component to read :id first.
export function LegacyAlbumRedirect() {
  const { id } = useParams();
  return <Navigate to={`/folders/${id}`} replace />;
}
