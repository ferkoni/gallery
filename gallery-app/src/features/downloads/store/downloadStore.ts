import { create } from 'zustand';

export type DownloadStatus = 'pending' | 'completed' | 'failed';

export type DownloadItem = {
  taskId: number;
  albumId: number;
  albumName: string;
  status: DownloadStatus;
  url?: string;
  completedAt?: string;
  error?: string;
};

type DownloadStore = {
  downloads: Record<number, DownloadItem>;
  enqueue: (taskId: number, albumId: number, albumName: string) => void;
  setCompleted: (taskId: number, url: string) => void;
  setFailed: (taskId: number, error: string) => void;
  remove: (taskId: number) => void;
};

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: {},

  enqueue: (taskId, albumId, albumName) =>
    set((s) => ({
      downloads: { ...s.downloads, [taskId]: { taskId, albumId, albumName, status: 'pending' } },
    })),

  setCompleted: (taskId, url) =>
    set((s) => {
      if (!s.downloads[taskId]) return s;
      return {
        downloads: {
          ...s.downloads,
          [taskId]: {
            ...s.downloads[taskId],
            status: 'completed',
            url,
            completedAt: new Date().toLocaleDateString('en-CA'),
          },
        },
      };
    }),

  setFailed: (taskId, error) =>
    set((s) => {
      if (!s.downloads[taskId]) return s;
      return {
        downloads: {
          ...s.downloads,
          [taskId]: { ...s.downloads[taskId], status: 'failed', error },
        },
      };
    }),

  remove: (taskId) =>
    set((s) => {
      const next = { ...s.downloads };
      delete next[taskId];
      return { downloads: next };
    }),
}));
