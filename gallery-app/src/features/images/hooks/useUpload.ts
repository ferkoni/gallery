import { useQueryClient } from '@tanstack/react-query';
import { useUploadStore } from '../store/uploadStore';
import { uploadImage } from '../api/imagesApi';
import { apiErrorMessage } from '@/lib/api/errorMessage';

export function useUpload(albumId: number) {
  const { enqueue, setProgress, setStatus } = useUploadStore();
  const qc = useQueryClient();

  async function upload(file: File, title: string) {
    const id = crypto.randomUUID();
    enqueue(id, { file, title, albumId });
    setStatus(id, 'uploading');

    try {
      await uploadImage(file, title, albumId, (pct) => setProgress(id, pct));
      setStatus(id, 'done');
      qc.invalidateQueries({ queryKey: ['albums', albumId, 'images'] });
    } catch (err) {
      setStatus(id, 'error', apiErrorMessage(err, 'Upload failed. Please try again.'));
    }
  }

  return { upload };
}
