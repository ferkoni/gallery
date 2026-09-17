import { isAxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadStore } from '../store/uploadStore';
import { uploadImage, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../api/imagesApi';
import { apiErrorMessage } from '@/lib/api/errorMessage';

const MB = 1024 * 1024;

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

export function useUpload(albumId: number) {
  const { enqueue, setProgress, setStatus } = useUploadStore();
  const qc = useQueryClient();

  async function upload(file: File, title: string) {
    const id = crypto.randomUUID();
    enqueue(id, { file, title, albumId });

    // Enqueued first, then failed in place: a file the browser refuses and a file the API
    // refuses appear the same way, in the one list the user already watches.
    const reason = rejection(file);
    if (reason) {
      setStatus(id, 'error', reason);
      return;
    }

    setStatus(id, 'uploading');

    try {
      await uploadImage(file, title, albumId, (pct) => setProgress(id, pct));
      setStatus(id, 'done');
      qc.invalidateQueries({ queryKey: ['albums', albumId, 'images'] });
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const fallback = status === 413 ? REFUSED_BY_PROXY : 'Upload failed. Please try again.';
      // The API's own sentence still wins when it sent one — a 422 from Images::Upload names
      // the real reason, and a 413 never has a body worth reading.
      setStatus(id, 'error', apiErrorMessage(err, fallback));
    }
  }

  return { upload };
}
