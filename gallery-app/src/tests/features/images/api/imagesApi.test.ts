import MockAdapter from 'axios-mock-adapter';
import { afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import type { AxiosRequestConfig, AxiosProgressEvent } from 'axios';
import apiClient from '@/lib/api/client';
import { fetchImages, uploadImage } from '@/features/images/api/imagesApi';
import type { Image } from '@/features/images/types/image';

const mock = new MockAdapter(apiClient);

const image: Image = {
  id: 1,
  title: 'Beach',
  s3_key: 'albums/1/uuid/photo.jpg',
  album_id: 1,
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
