import { create } from 'zustand';

export type DownloadStatus = 'pending' | 'ready' | 'failed';

export type DownloadItem = {
  taskId: number;
  albumName: string;
  status: DownloadStatus;
  url?: string;
  error?: string;
};

type DownloadStore = {
  downloads: Record<number, DownloadItem>;
  enqueue: (taskId: number, albumName: string) => void;
  setReady: (taskId: number, url: string) => void;
  setFailed: (taskId: number, error: string) => void;
  remove: (taskId: number) => void;
};

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: {},

  enqueue: (taskId, albumName) =>
    set((s) => ({
      downloads: { ...s.downloads, [taskId]: { taskId, albumName, status: 'pending' } },
    })),

  setReady: (taskId, url) =>
    set((s) => ({
      downloads: {
        ...s.downloads,
        [taskId]: { ...s.downloads[taskId], status: 'ready', url },
      },
    })),

  setFailed: (taskId, error) =>
    set((s) => ({
      downloads: {
        ...s.downloads,
        [taskId]: { ...s.downloads[taskId], status: 'failed', error },
      },
    })),

  remove: (taskId) =>
    set((s) => {
      const { [taskId]: _, ...rest } = s.downloads;
      return { downloads: rest };
    }),
}));
