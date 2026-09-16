import { useState } from 'react';
import { createDownloadTask } from '../api/asyncTasksApi';
import { useDownloadStore } from '../store/downloadStore';
import { apiErrorMessage } from '@/lib/api/errorMessage';

export function useDownloadAlbum() {
  const { enqueue, enqueueFailed } = useDownloadStore();
  const [isLoading, setIsLoading] = useState(false);

  async function downloadAlbum(albumId: number, albumName: string): Promise<boolean> {
    setIsLoading(true);
    try {
      const { task_id } = await createDownloadTask(albumId);
      enqueue(task_id, albumId, albumName);
      return true;
    } catch (err) {
      // A refusal the server explains — "Album has no images" for a folder whose whole
      // subtree is empty — goes to the download queue, which already renders a failed item
      // with Try again and Dismiss. The bare catch this replaces swallowed the sentence and
      // showed a fixed one beside the button instead.
      enqueueFailed(albumId, albumName, apiErrorMessage(err, 'Failed to start download'));
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  return { downloadAlbum, isLoading };
}
