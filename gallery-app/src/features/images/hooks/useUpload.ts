import { isAxiosError } from 'axios';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useUploadStore, type UploadItem } from '../store/uploadStore';
import { uploadImage, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../api/imagesApi';
import { apiErrorMessage } from '@/lib/api/errorMessage';

const MB = 1024 * 1024;

// At most two uploads in flight, however many files were chosen. The server holds one of Puma's
// three threads (RAILS_MAX_THREADS) per upload while it writes the photo to S3 over the owner's
// uplink, and every other request — the grid, login, the health check — needs a free one. Two
// leave one free. The rest wait in the store as 'pending' (docs: upload-queue/02, decision 1).
export const MAX_CONCURRENT_UPLOADS = 2;

// Null when the file is worth sending. The API would refuse both of these anyway; refusing
// here makes it instant instead of 25 MB late (docs: upload-size-limit/02, decisions 5 and 8).
function rejection(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Too large (${(file.size / MB).toFixed(1)} MB). The limit is ${MAX_UPLOAD_BYTES / MB} MB.`;
  }
  // An empty type is the browser declining to guess rather than evidence about the file, so it
  // is sent and the server reads the bytes.
  if (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return 'Not a JPEG, PNG, WebP or GIF.';
  }
  return null;
}

// Something in front of Gallery refused the body. Not our own nginx, whose limit is above
// MAX_UPLOAD_BYTES and which `rejection` keeps requests away from — so this is always someone
// else's proxy, and it can say so (docs: upload-size-limit/02, decision 6).
const REFUSED_BY_PROXY =
  'Refused as too large before it reached Gallery. If you run a proxy in front of Gallery, ' +
  'raise its body-size limit.';

// Starts waiting uploads until the cap is reached. Runs when a file is added and whenever one
// finishes, so the queue drains with no timer and no component that has to stay mounted.
function pump(qc: QueryClient) {
  const { claimNext } = useUploadStore.getState();
  for (let item = claimNext(MAX_CONCURRENT_UPLOADS); item; item = claimNext(MAX_CONCURRENT_UPLOADS)) {
    void send(item, qc);
  }
}

async function send(item: UploadItem, qc: QueryClient) {
  const { setProgress, setStatus } = useUploadStore.getState();
  try {
    await uploadImage(item.file, item.title, item.albumId, (pct) => setProgress(item.id, pct));
    setStatus(item.id, 'done');
    qc.invalidateQueries({ queryKey: ['albums', item.albumId, 'images'] });
  } catch (err) {
    const status = isAxiosError(err) ? err.response?.status : undefined;
    const fallback = status === 413 ? REFUSED_BY_PROXY : 'Upload failed. Please try again.';
    // The API's own sentence still wins when it sent one — a 422 from Images::Upload names
    // the real reason, and a 413 never has a body worth reading.
    setStatus(item.id, 'error', apiErrorMessage(err, fallback));
  } finally {
    // A failure frees its slot as surely as a success.
    pump(qc);
  }
}

// Resolves once the item has finished — done, failed or removed — however long it waited.
function settled(id: string): Promise<void> {
  const finished = () => {
    const item = useUploadStore.getState().queue.find((i) => i.id === id);
    return !item || item.status === 'done' || item.status === 'error';
  };
  return new Promise((resolve) => {
    if (finished()) return resolve();
    const unsubscribe = useUploadStore.subscribe(() => {
      if (!finished()) return;
      unsubscribe();
      resolve();
    });
  });
}

export function useUpload(albumId: number) {
  const { enqueue, setStatus } = useUploadStore();
  const qc = useQueryClient();

  // Resolves when this file has finished, which may be after others ahead of it in the queue.
  async function upload(file: File, title: string) {
    const id = crypto.randomUUID();
    enqueue(id, { file, title, albumId });

    // Enqueued first, then failed in place: a file the browser refuses and a file the API
    // refuses appear the same way, in the one list the user already watches. A refused file
    // never takes a slot.
    const reason = rejection(file);
    if (reason) {
      setStatus(id, 'error', reason);
      return;
    }

    pump(qc);
    await settled(id);
  }

  return { upload };
}
