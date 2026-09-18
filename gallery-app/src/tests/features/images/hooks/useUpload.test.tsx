import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { useUpload, MAX_CONCURRENT_UPLOADS } from '@/features/images/hooks/useUpload';
import { uploadImage } from '@/features/images/api/imagesApi';
import { useUploadStore } from '@/features/images/store/uploadStore';
import type { Image } from '@/features/images/types/image';

// Only the network call is mocked. MAX_UPLOAD_BYTES and ALLOWED_UPLOAD_TYPES are the real
// constants the hook enforces — automocking the whole module empties the array and leaves the
// limit undefined, so the checks would pass or fail for reasons the test invented.
vi.mock('@/features/images/api/imagesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/images/api/imagesApi')>()),
  uploadImage: vi.fn(),
}));
const mockUploadImage = vi.mocked(uploadImage);

const image: Image = {
  id: 1,
  title: 'Beach',
  description: null,
  tags: [],
  s3_key: 'images/uuid/photo.jpg',
  album_id: 1,
  favorited: false,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://signed-url',
  thumbnail_url: 'https://signed-thumb-url',
};

const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

// 26 MB without allocating 26 MB: the hook reads .size, and nothing reads the bytes.
function sized(bytes: number, type = 'image/jpeg') {
  const big = new File(['x'], 'huge.jpg', { type });
  Object.defineProperty(big, 'size', { value: bytes });
  return big;
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useUpload', () => {
  beforeEach(() => {
    useUploadStore.setState({ queue: [] });
    mockUploadImage.mockReset();
  });

  it('enqueues the item, sets status to done, and calls setProgress on success', async () => {
    mockUploadImage.mockImplementation(async (_file, _title, _albumId, onProgress) => {
      onProgress(75);
      return image;
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('done');
    expect(item.progress).toBe(75);
    expect(item.albumId).toBe(1);
  });

  it('invalidates the correct query key on success', async () => {
    mockUploadImage.mockResolvedValue(image);

    const { queryClient, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['albums', 1, 'images'] });
  });

  it('does not invalidate queries when upload fails', async () => {
    mockUploadImage.mockRejectedValue(new Error('Network error'));

    const { queryClient, wrapper } = makeWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    expect(invalidate).not.toHaveBeenCalled();
  });

  // What the API sends when a write to the user's bucket fails, the original's or
  // the thumbnail's. Before, the queue showed "Request failed with status code 422"
  // for this and for every other rejected upload.
  it("shows the API's message when the upload is rejected", async () => {
    const message = 'Could not save the photo to your S3 bucket. Check your storage settings and try again.';
    mockUploadImage.mockRejectedValue(
      new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422,
        data: { errors: message },
      } as AxiosResponse),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe(message);
  });

  it('shows a generic message when there is no API message, never an internal one', async () => {
    mockUploadImage.mockRejectedValue(new Error('Network error'));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe('Upload failed. Please try again.');
  });

  // Refused before the request rather than after 25 MB of transfer. The queue is where a
  // rejected upload is reported, whoever rejected it, so this reads like a 422 would.
  it('refuses a file over the limit without sending it', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(sized(26 * 1024 * 1024), 'Huge'));

    const item = useUploadStore.getState().queue[0];
    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(item.status).toBe('error');
    expect(item.error).toBe('Too large (26.0 MB). The limit is 25 MB.');
    // Never 'uploading', so no progress bar appears for a file that never left.
    expect(item.progress).toBe(0);
  });

  // accept="image/*" is wider than Images::Upload::ALLOWED_TYPES, so the picker lets these
  // through and the API would answer 422 after the whole transfer.
  it('refuses a file whose type the API would reject, without sending it', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(sized(1000, 'application/pdf'), 'Not a photo'));

    const item = useUploadStore.getState().queue[0];
    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(item.status).toBe('error');
    expect(item.error).toBe('Not a JPEG, PNG, WebP or GIF.');
  });

  // An empty type is the browser declining to guess — some Android pickers send nothing — and
  // that is not evidence about the file. The server reads the bytes, so it decides.
  it('sends a file whose type the browser did not report', async () => {
    mockUploadImage.mockResolvedValue(image);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(sized(1000, ''), 'Unknown type'));

    expect(mockUploadImage).toHaveBeenCalled();
    expect(useUploadStore.getState().queue[0].status).toBe('done');
  });

  // Our own nginx allows more than the limit, and the check above keeps requests away from it
  // anyway, so a 413 always comes from a proxy the user put in front of Gallery. Saying
  // "try again" to that is a loop.
  it('explains a 413 from a proxy in front of Gallery', async () => {
    mockUploadImage.mockRejectedValue(
      new AxiosError('Request failed with status code 413', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 413,
        data: '<html><head><title>413 Request Entity Too Large</title></head></html>',
      } as AxiosResponse),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpload(1), { wrapper });
    await act(() => result.current.upload(file, 'Beach'));

    const item = useUploadStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toBe(
      'Refused as too large before it reached Gallery. If you run a proxy in front of Gallery, ' +
        'raise its body-size limit.',
    );
  });

  // Every file chosen used to be sent at once, and each held one of Puma's three threads for
  // its S3 write, so a bulk upload stalled every other request (docs: upload-queue/01).
  describe('two at a time', () => {
    // An upload that finishes only when the test says so.
    function controllable() {
      const pending: Array<{ resolve: () => void; reject: (e: unknown) => void; name: string }> = [];
      mockUploadImage.mockImplementation(
        (f) => new Promise<Image>((resolve, reject) => {
          pending.push({ resolve: () => resolve(image), reject, name: (f as File).name });
        })
      );
      return pending;
    }
    const files = (n: number) => Array.from({ length: n }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }));
    const statuses = () => useUploadStore.getState().queue.map((i) => i.status);
    const flush = () => act(async () => {});

    it('is two', () => {
      expect(MAX_CONCURRENT_UPLOADS).toBe(2);
    });

    it('sends two of five at once and holds the rest as waiting', async () => {
      const inFlight = controllable();
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useUpload(1), { wrapper });

      act(() => { files(5).forEach((f) => void result.current.upload(f, '')); });
      await flush();

      expect(mockUploadImage).toHaveBeenCalledTimes(2);
      expect(statuses()).toEqual(['uploading', 'uploading', 'pending', 'pending', 'pending']);
      expect(inFlight.map((u) => u.name)).toEqual(['p0.jpg', 'p1.jpg']);
    });

    it('starts the next one as each finishes, in the order chosen, until all are done', async () => {
      const inFlight = controllable();
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useUpload(1), { wrapper });
      act(() => { files(5).forEach((f) => void result.current.upload(f, '')); });
      await flush();

      for (let sent = 2; sent < 5; sent++) {
        inFlight[sent - 2].resolve();
        await flush();
        expect(mockUploadImage).toHaveBeenCalledTimes(sent + 1);
        expect(statuses().filter((s) => s === 'uploading')).toHaveLength(2);
      }
      inFlight.slice(3).forEach((u) => u.resolve());
      await flush();

      expect(inFlight.map((u) => u.name)).toEqual(['p0.jpg', 'p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']);
      expect(statuses()).toEqual(['done', 'done', 'done', 'done', 'done']);
    });

    it('frees the slot of a failed upload too', async () => {
      const inFlight = controllable();
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useUpload(1), { wrapper });
      act(() => { files(3).forEach((f) => void result.current.upload(f, '')); });
      await flush();

      inFlight[0].reject(new Error('network'));
      await flush();

      expect(statuses()).toEqual(['error', 'uploading', 'uploading']);
      expect(mockUploadImage).toHaveBeenCalledTimes(3);
    });

    it('never gives a slot to a file refused in the browser', async () => {
      controllable();
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useUpload(1), { wrapper });

      act(() => {
        void result.current.upload(sized(26 * 1024 * 1024), '');
        files(2).forEach((f) => void result.current.upload(f, ''));
      });
      await flush();

      expect(statuses()).toEqual(['error', 'uploading', 'uploading']);
    });

    it("resolves each upload() when its own file finishes, however long it waited", async () => {
      const inFlight = controllable();
      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useUpload(1), { wrapper });
      const finished: string[] = [];
      act(() => {
        files(3).forEach((f) => void result.current.upload(f, '').then(() => finished.push(f.name)));
      });
      await flush();

      inFlight[1].resolve();
      await flush();
      expect(finished).toEqual(['p1.jpg']);

      inFlight[0].resolve();
      await flush();
      inFlight[2].resolve();
      await flush();
      expect(finished).toEqual(['p1.jpg', 'p0.jpg', 'p2.jpg']);
    });

    // The queue is the store, not the button: leaving the folder page must not strand it.
    it('keeps draining after the component that started it unmounts', async () => {
      const inFlight = controllable();
      const { wrapper } = makeWrapper();
      const { result, unmount } = renderHook(() => useUpload(1), { wrapper });
      act(() => { files(3).forEach((f) => void result.current.upload(f, '')); });
      await flush();

      unmount();
      inFlight[0].resolve();
      await flush();

      expect(mockUploadImage).toHaveBeenCalledTimes(3);
    });
  });
});
