import apiClient from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';
import type { Album } from '@/features/albums/types/album';

export type AlbumPageParams = {
  // A name substring. The server searches the whole tree and ignores parentId.
  q?: string;
  // Which level to list. undefined is the top level.
  parentId?: number;
  // Hides a folder and its descendants, so a search cannot offer a move that
  // makes a cycle the way browsing levels already cannot.
  excludeSubtree?: number;
};

// GET /api/albums?page=&q=&parent_id=&exclude_subtree=
//
// Beside createCrudApi rather than inside it: the generic helper has no business
// growing query parameters that only albums have.
export async function fetchAlbumPage(
  page = 1,
  { q, parentId, excludeSubtree }: AlbumPageParams = {}
): Promise<PaginatedResponse<Album>> {
  const res = await apiClient.get('/api/albums', {
    params: {
      page,
      ...(q && { q }),
      ...(parentId !== undefined && { parent_id: parentId }),
      ...(excludeSubtree !== undefined && { exclude_subtree: excludeSubtree }),
    },
  });
  return {
    data: res.data.data.map((item: { attributes: Album }) => item.attributes),
    meta: res.data.meta,
  };
}
