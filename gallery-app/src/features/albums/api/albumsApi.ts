import apiClient from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';
import type { Album } from '@/features/albums/types/album';

// GET /api/albums?page=&q=
//
// Beside createCrudApi rather than inside it: the generic helper has no business
// growing a query parameter that only albums have.
export async function fetchAlbumPage(page = 1, q?: string): Promise<PaginatedResponse<Album>> {
  const res = await apiClient.get('/api/albums', {
    params: { page, ...(q && { q }) },
  });
  return {
    data: res.data.data.map((item: { attributes: Album }) => item.attributes),
    meta: res.data.meta,
  };
}
