import { create } from 'zustand';

export type DownloadStatus = 'pending' | 'ready' | 'failed';

export type DownloadItem = {
  taskId: number;
  albumId: number;
  albumName: string;
  status: DownloadStatus;
  url?: string;
  readyAt?: string;
  error?: string;
};

type DownloadStore = {
  downloads: Record<number, DownloadItem>;
  enqueue: (taskId: number, albumId: number, albumName: string) => void;
  setReady: (taskId: number, url: string) => void;
  setFailed: (taskId: number, error: string) => void;
  remove: (taskId: number) => void;
};

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: {},

  enqueue: (taskId, albumId, albumName) =>
    set((s) => ({
      downloads: { ...s.downloads, [taskId]: { taskId, albumId, albumName, status: 'pending' } },
    })),

  setReady: (taskId, url) =>
    set((s) => {
      if (!s.downloads[taskId]) return s;
      return {
        downloads: {
          ...s.downloads,
          [taskId]: {
            ...s.downloads[taskId],
            status: 'ready',
            url,
            readyAt: new Date().toLocaleDateString('en-CA'),
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
