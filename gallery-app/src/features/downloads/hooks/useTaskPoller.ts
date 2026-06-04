import { useEffect } from 'react';
import { useDownloadStore } from '../store/downloadStore';
import { getAsyncTask } from '../api/asyncTasksApi';

const POLL_INTERVAL_MS = 3000;

export function useTaskPoller() {
  useEffect(() => {
    const timer = setInterval(async () => {
      const { downloads } = useDownloadStore.getState();
      const pending = Object.values(downloads).filter((d) => d.status === 'pending');

      await Promise.all(
        pending.map(async ({ taskId }) => {
          try {
            const task = await getAsyncTask(taskId);
            if (task.attributes.status === 'ready') {
              useDownloadStore.getState().setReady(taskId, task.attributes.result.url ?? '');
            } else if (task.attributes.status === 'failed') {
              useDownloadStore.getState().setFailed(taskId, task.attributes.result.error ?? 'Download failed');
            }
          } catch {
            useDownloadStore.getState().setFailed(taskId, 'Failed to check download status');
          }
        })
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);
}
