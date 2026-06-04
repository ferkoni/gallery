import { useState } from 'react';
import { createDownloadTask } from '../api/asyncTasksApi';
import { useDownloadStore } from '../store/downloadStore';

export function useDownloadAlbum() {
  const { enqueue } = useDownloadStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadAlbum(albumId: number, albumName: string): Promise<boolean> {
    setIsLoading(true);
    setError(null);
    try {
      const { task_id } = await createDownloadTask(albumId);
      enqueue(task_id, albumId, albumName);
      return true;
    } catch {
      setError('Failed to start download');
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return { downloadAlbum, isLoading, error };
}
