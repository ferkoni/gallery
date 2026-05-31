import MockAdapter from 'axios-mock-adapter';
import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import type { AxiosRequestConfig, AxiosProgressEvent } from 'axios';
import apiClient from '@/lib/api/client';
import { fetchImages, fetchFavoriteImages, uploadImage, updateImage, deleteImage } from '@/features/images/api/imagesApi';
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
};

afterAll(() => mock.restore());

describe('fetchImages', () => {
  beforeEach(() => mock.reset());

  it('returns images for the given albumId and sends album_id param', async () => {
    mock.onGet('/api/images').reply(200, { data: [{ attributes: image }] });

    const result = await fetchImages(1);

    expect(result).toEqual([image]);
    expect(mock.history.get[0].params).toEqual({ album_id: 1 });
  });

  it('returns all images with empty params when no albumId is provided', async () => {
    mock.onGet('/api/images').reply(200, { data: [{ attributes: image }] });

    const result = await fetchImages();

    expect(result).toEqual([image]);
    expect(mock.history.get[0].params).toEqual({});
  });
});

describe('fetchFavoriteImages', () => {
  beforeEach(() => mock.reset());

  it('fetches images with favorited=true param', async () => {
    mock.onGet('/api/images').reply(200, { data: [{ attributes: image }] });

    const result = await fetchFavoriteImages();

    expect(result).toEqual([image]);
    expect(mock.history.get[0].params).toEqual({ favorited: true });
  });
});

describe('uploadImage', () => {
  beforeEach(() => mock.reset());

  it('posts FormData to /api/images and returns the created image', async () => {
    mock.onPost('/api/images').reply(201, { data: { attributes: image } });

    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await uploadImage(file, 'Beach', 1, vi.fn());

    expect(result).toEqual(image);
    expect(mock.history.post[0].data).toBeInstanceOf(FormData);
  });

  it('calls onProgress with percentage when e.total is defined', async () => {
    mock.onPost('/api/images').reply(201, { data: { attributes: image } });

    const onProgress = vi.fn();
    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

    await uploadImage(file, 'Beach', 1, onProgress);

    const config = mock.history.post[0] as AxiosRequestConfig;
    config.onUploadProgress?.({ loaded: 50, total: 100, bytes: 50 } as AxiosProgressEvent);

    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it('does not call onProgress when e.total is falsy', async () => {
    mock.onPost('/api/images').reply(201, { data: { attributes: image } });

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

  it('patches /api/images/:id and returns the updated image', async () => {
    const updated: Image = { ...image, title: 'New Beach' };
    mock.onPatch('/api/images/1').reply(200, { data: { attributes: updated } });

    const result = await updateImage(1, { title: 'New Beach' });

    expect(result).toEqual(updated);
    expect(mock.history.patch[0].url).toBe('/api/images/1');
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ image: { title: 'New Beach' } });
  });

  it('sends tags as an array inside the image wrapper', async () => {
    mock.onPatch('/api/images/1').reply(200, { data: { attributes: image } });

    await updateImage(1, { tags: ['sea', 'sun'] });

    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ image: { tags: ['sea', 'sun'] } });
  });

  it('sends description and album_id when provided', async () => {
    const updated: Image = { ...image, description: 'Sunny day', album_id: 2 };
    mock.onPatch('/api/images/1').reply(200, { data: { attributes: updated } });

    const result = await updateImage(1, { description: 'Sunny day', album_id: 2 });

    expect(result).toEqual(updated);
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({
      image: { description: 'Sunny day', album_id: 2 },
    });
  });
});

describe('deleteImage', () => {
  beforeEach(() => mock.reset());

  it('sends DELETE to /api/images/:id', async () => {
    mock.onDelete('/api/images/1').reply(204);

    await deleteImage(1);

    expect(mock.history.delete[0].url).toBe('/api/images/1');
  });

  it('throws when the server responds with an error', async () => {
    mock.onDelete('/api/images/1').reply(500);

    await expect(deleteImage(1)).rejects.toThrow();
  });
});
