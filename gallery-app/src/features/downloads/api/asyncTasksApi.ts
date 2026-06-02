import apiClient from '@/lib/api/client';

export async function createDownloadTask(albumId: number): Promise<{ task_id: number }> {
  const { data } = await apiClient.post('/api/async_tasks', {
    task_type: 'album_download',
    payload: { album_id: albumId },
  });
  return data;
}
