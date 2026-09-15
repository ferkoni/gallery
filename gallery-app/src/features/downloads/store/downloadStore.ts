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
  enqueueFailed: (albumId: number, albumName: string, error: string) => void;
  setCompleted: (taskId: number, url: string) => void;
  setFailed: (taskId: number, error: string) => void;
  remove: (taskId: number) => void;
};

// A refusal the server made before it minted a task has no task id, so it gets a negative
// one. Everything downstream keys off taskId and does not care what it is; useTaskPoller
// never sees these, because it polls only pending items.
let nextLocalId = 0;

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: {},

  enqueue: (taskId, albumId, albumName) =>
    set((s) => ({
      downloads: { ...s.downloads, [taskId]: { taskId, albumId, albumName, status: 'pending' } },
    })),

  enqueueFailed: (albumId, albumName, error) =>
    set((s) => {
      const taskId = --nextLocalId;
      return {
        downloads: {
          ...s.downloads,
          [taskId]: { taskId, albumId, albumName, status: 'failed', error },
        },
      };
    }),

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
