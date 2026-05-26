import apiClient from '@/lib/api/client';
import type { Image } from '../types/image';

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

// GET /api/images/:id/url
export async function fetchImageUrl(imageId: number): Promise<string> {
  const res = await apiClient.get(`/api/images/${imageId}/url`);
  return res.data.url;
}
