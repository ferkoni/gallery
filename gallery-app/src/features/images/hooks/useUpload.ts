import { useQueryClient } from '@tanstack/react-query';
import { useUploadStore } from '../store/uploadStore';
import { uploadImage } from '../api/imagesApi';

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
      const message = err instanceof Error ? err.message : 'Upload failed';
      setStatus(id, 'error', message);
    }
  }

  return { upload };
}
