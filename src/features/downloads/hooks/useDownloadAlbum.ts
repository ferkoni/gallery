import { createDownloadTask } from '../api/asyncTasksApi';
import { useDownloadStore } from '../store/downloadStore';

export function useDownloadAlbum() {
  const { enqueue } = useDownloadStore();

  async function downloadAlbum(albumId: number, albumName: string) {
    const { task_id } = await createDownloadTask(albumId);
    enqueue(task_id, albumName);
  }

  return { downloadAlbum };
}
