import apiClient from '@/lib/api/client';

export async function createDownloadTask(albumId: number): Promise<{ task_id: number }> {
  const { data } = await apiClient.post('/api/async_tasks', {
    async_task: {
      task_type: 'album_download',
      payload: { album_id: albumId },
    },
  });
  return data;
}

export type AsyncTaskStatus = 'pending' | 'completed' | 'failed';

export type AsyncTask = {
  id: string;
  attributes: {
    status: AsyncTaskStatus;
    result: { url?: string; error?: string };
  };
};

export async function getAsyncTask(taskId: number): Promise<AsyncTask> {
  const { data } = await apiClient.get(`/api/async_tasks/${taskId}`);
  return data.data;
}
