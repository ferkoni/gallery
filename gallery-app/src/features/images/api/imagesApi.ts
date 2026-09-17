import apiClient from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';
import type { Image, UpdateImagePayload } from '../types/image';

export type SearchParams = {
  q?: string;
  title?: string;
  tag?: string;
  from?: string;
  albumId?: number;
};

export type AlbumImageFilters = {
  title?: string;
  tag?: string;
  from?: string;
};

// GET /api/v1/albums/:albumId/images?page=&title=&tag=&from=
export async function fetchAlbumImages(albumId: number, page = 1, filters?: AlbumImageFilters): Promise<PaginatedResponse<Image>> {
  const res = await apiClient.get(`/albums/${albumId}/images`, { params: { page, ...filters } });
  return {
    data: res.data.data.map((item: { attributes: Image }) => item.attributes),
    meta: res.data.meta,
  };
}

// GET /api/v1/images?favorited=true&page=
export async function fetchFavoriteImages(page = 1): Promise<PaginatedResponse<Image>> {
  const res = await apiClient.get('/images', { params: { favorited: true, page } });
  return {
    data: res.data.data.map((item: { attributes: Image }) => item.attributes),
    meta: res.data.meta,
  };
}

// GET /api/v1/images?q=…&title=…&tag=…&from=…&album_id=…&page=
export async function fetchSearchImages(params: SearchParams, page = 1): Promise<PaginatedResponse<Image>> {
  const { albumId, ...rest } = params;
  const res = await apiClient.get('/images', {
    params: { ...rest, ...(albumId !== undefined && { album_id: albumId }), page },
  });
  return {
    data: res.data.data.map((item: { attributes: Image }) => item.attributes),
    meta: res.data.meta,
  };
}

// POST /api/v1/images  (multipart/form-data)
export async function uploadImage(
  file: File,
  title: string,
  albumId: number,
  onProgress: (pct: number) => void
): Promise<Image> {
  const form = new FormData();
  form.append('image[file]', file);
  form.append('image[title]', title);
  form.append('image[album_id]', String(albumId));

  const res = await apiClient.post('/images', form, {
    headers: { 'Content-Type': undefined }, // let axios set multipart/form-data + boundary
    onUploadProgress: (e) => {
      if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return res.data.data.attributes;
}

// PATCH /api/v1/images/:id
export async function updateImage(id: number, data: UpdateImagePayload): Promise<Image> {
  const res = await apiClient.patch(`/images/${id}`, { image: data });
  return res.data.data.attributes;
}

// DELETE /api/v1/images/:id
export async function deleteImage(id: number): Promise<void> {
  await apiClient.delete(`/images/${id}`);
}

// Images::Upload::MAX_SIZE_BYTES. Checked in useUpload before the request, so an oversized
// photo costs no transfer. nginx allows a little more (client_max_body_size 30m), so a file
// just over this gets the API's 422 rather than a proxy's 413.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Images::Upload::ALLOWED_TYPES. accept="image/*" on the input is a hint, and it is wider than
// this: HEIC, AVIF and TIFF all pass the picker and would fail server-side.
export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Images::Move::MAX_IDS. The toolbar disables Move to… above it rather than splitting a batch.
export const MAX_MOVE = 500;

// PATCH /api/v1/images/move — every photo moves, or none do (204).
export async function moveImages(ids: number[], albumId: number): Promise<void> {
  await apiClient.patch('/images/move', { ids, album_id: albumId });
}
