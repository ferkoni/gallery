import MockAdapter from 'axios-mock-adapter';
import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import type { AxiosRequestConfig, AxiosProgressEvent } from 'axios';
import apiClient from '@/lib/api/client';
import { fetchFavoriteImages, fetchSearchImages, uploadImage, updateImage, deleteImage } from '@/features/images/api/imagesApi';
import type { Image } from '@/features/images/types/image';

const mock = new MockAdapter(apiClient);

const image: Image = {
  id: 1,
  title: 'Beach',
  description: null,
  tags: [],
  s3_key: 'albums/1/uuid/photo.jpg',
  album_id: 1,
  favorited: false,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://my-bucket.s3.us-east-1.amazonaws.com/albums/1/uuid/photo.jpg?sig=abc',
  thumbnail_url: 'https://my-bucket.s3.us-east-1.amazonaws.com/albums/1/uuid/photo.thumb.webp?sig=abc',
};

afterAll(() => mock.restore());

const meta = { current_page: 1, total_pages: 2, total_count: 26, per_page: 25 };

describe('fetchFavoriteImages', () => {
  beforeEach(() => mock.reset());

  it('asks for page 1 of favorited images by default', async () => {
    mock.onGet('/images').reply(200, { data: [{ attributes: image }], meta });

    await fetchFavoriteImages();

    expect(mock.history.get[0].params).toEqual({ favorited: true, page: 1 });
  });

  it('sends the page it is given and returns the images with their meta', async () => {
    mock.onGet('/images').reply(200, { data: [{ attributes: image }], meta });

    const result = await fetchFavoriteImages(2);

    expect(result).toEqual({ data: [image], meta });
    expect(mock.history.get[0].params).toEqual({ favorited: true, page: 2 });
  });
});

describe('fetchSearchImages', () => {
  beforeEach(() => mock.reset());

  it('sends the filters and page, and returns the images with their meta', async () => {
    mock.onGet('/images').reply(200, { data: [{ attributes: image }], meta });

    const result = await fetchSearchImages({ q: 'lentes', tag: 'family' }, 2);

    expect(result).toEqual({ data: [image], meta });
    expect(mock.history.get[0].params).toEqual({ q: 'lentes', tag: 'family', page: 2 });
  });

  it('asks for page 1 by default and sends albumId as album_id', async () => {
    mock.onGet('/images').reply(200, { data: [], meta });

    await fetchSearchImages({ q: 'lentes', albumId: 7 });

    expect(mock.history.get[0].params).toEqual({ q: 'lentes', album_id: 7, page: 1 });
  });
});

describe('uploadImage', () => {
  beforeEach(() => mock.reset());

  it('posts FormData to /api/v1/images and returns the created image', async () => {
    mock.onPost('/images').reply(201, { data: { attributes: image } });

    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await uploadImage(file, 'Beach', 1, vi.fn());

    expect(result).toEqual(image);
    expect(mock.history.post[0].data).toBeInstanceOf(FormData);
  });

  it('calls onProgress with percentage when e.total is defined', async () => {
    mock.onPost('/images').reply(201, { data: { attributes: image } });

    const onProgress = vi.fn();
    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadImage(file, 'Beach', 1, onProgress);

    const config = mock.history.post[0] as AxiosRequestConfig;
    config.onUploadProgress?.({ loaded: 50, total: 100, bytes: 50 } as AxiosProgressEvent);

    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it('does not call onProgress when e.total is falsy', async () => {
    mock.onPost('/images').reply(201, { data: { attributes: image } });

    const onProgress = vi.fn();
    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadImage(file, 'Beach', 1, onProgress);

    const config = mock.history.post[0] as AxiosRequestConfig;
    config.onUploadProgress?.({ loaded: 50, bytes: 50 } as AxiosProgressEvent);

    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('updateImage', () => {
  beforeEach(() => mock.reset());

  it('patches /api/v1/images/:id and returns the updated image', async () => {
    const updated: Image = { ...image, title: 'New Beach' };
    mock.onPatch('/images/1').reply(200, { data: { attributes: updated } });

    const result = await updateImage(1, { title: 'New Beach' });

    expect(result).toEqual(updated);
    expect(mock.history.patch[0].url).toBe('/images/1');
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ image: { title: 'New Beach' } });
  });

  it('sends tags as an array inside the image wrapper', async () => {
    mock.onPatch('/images/1').reply(200, { data: { attributes: image } });

    await updateImage(1, { tags: ['sea', 'sun'] });

    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ image: { tags: ['sea', 'sun'] } });
  });

  it('sends description and album_id when provided', async () => {
    const updated: Image = { ...image, description: 'Sunny day', album_id: 2 };
    mock.onPatch('/images/1').reply(200, { data: { attributes: updated } });

    const result = await updateImage(1, { description: 'Sunny day', album_id: 2 });

    expect(result).toEqual(updated);
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({
      image: { description: 'Sunny day', album_id: 2 },
    });
  });
});

describe('deleteImage', () => {
  beforeEach(() => mock.reset());

  it('sends DELETE to /api/v1/images/:id', async () => {
    mock.onDelete('/images/1').reply(204);

    await deleteImage(1);

    expect(mock.history.delete[0].url).toBe('/images/1');
  });

  it('throws when the server responds with an error', async () => {
    mock.onDelete('/images/1').reply(500);

    await expect(deleteImage(1)).rejects.toThrow();
  });
});
