import apiClient from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';
import type { Image, UpdateImagePayload } from '../types/image';

// GET /api/albums/:albumId/images?page=
export async function fetchAlbumImages(albumId: number, page = 1): Promise<PaginatedResponse<Image>> {
  const res = await apiClient.get(`/api/albums/${albumId}/images`, { params: { page } });
  return {
    data: res.data.data.map((item: { attributes: Image }) => item.attributes),
    meta: res.data.meta,
  };
}

// GET /api/images?album_id=
export async function fetchImages(albumId?: number): Promise<Image[]> {
  const res = await apiClient.get('/api/images', {
    params: albumId ? { album_id: albumId } : {},
  });
  return res.data.data.map((item: { attributes: Image }) => item.attributes);
}

// POST /api/images  (multipart/form-data)
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

  const res = await apiClient.post('/api/images', form, {
    headers: { 'Content-Type': undefined }, // let axios set multipart/form-data + boundary
    onUploadProgress: (e) => {
      if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return res.data.data.attributes;
}

// PATCH /api/images/:id
export async function updateImage(id: number, data: UpdateImagePayload): Promise<Image> {
  const res = await apiClient.patch(`/api/images/${id}`, { image: data });
  return res.data.data.attributes;
}
