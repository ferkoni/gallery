import { create } from 'zustand';

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

export type UploadItem = {
  id: string;
  file: File;
  title: string;
  albumId: number;
  progress: number;
  status: UploadStatus;
  error?: string;
};

type UploadStore = {
  queue: UploadItem[];
  enqueue: (id: string, item: Omit<UploadItem, 'id' | 'progress' | 'status'>) => void;
  setProgress: (id: string, progress: number) => void;
  setStatus: (id: string, status: UploadStatus, error?: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  // Marks the first waiting item as uploading and returns it, or null when `limit` uploads are
  // already running or nothing is waiting. One synchronous set(), so no two callers can claim
  // the same item (docs: upload-queue/02, decision 2).
  claimNext: (limit: number) => UploadItem | null;
};

export const useUploadStore = create<UploadStore>((set) => ({
  queue: [],

  enqueue: (id, item) =>
    set((s) => ({
      queue: [...s.queue, { ...item, id, progress: 0, status: 'pending' }],
    })),

  setProgress: (id, progress) =>
    set((s) => ({
      queue: s.queue.map((i) => (i.id === id ? { ...i, progress } : i)),
    })),

  setStatus: (id, status, error) =>
    set((s) => ({
      queue: s.queue.map((i) => (i.id === id ? { ...i, status, error } : i)),
    })),

  remove: (id) =>
    set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),

  clearCompleted: () =>
    set((s) => ({ queue: s.queue.filter((i) => i.status !== 'done') })),

  claimNext: (limit) => {
    let claimed: UploadItem | null = null;
    set((s) => {
      if (s.queue.filter((i) => i.status === 'uploading').length >= limit) return s;
      const next = s.queue.find((i) => i.status === 'pending');
      if (!next) return s;
      const item: UploadItem = { ...next, status: 'uploading', progress: 0 };
      claimed = item;
      return { queue: s.queue.map((i) => (i.id === next.id ? item : i)) };
    });
    return claimed;
  },
}));
