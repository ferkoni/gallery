import apiClient from '@/lib/api/client';

export function createCrudApi<T>(path: string) {
  return {
    fetchAll: async (): Promise<T[]> => {
      const res = await apiClient.get(path);
      return res.data.data.map((item: { attributes: T }) => item.attributes);
    },
    fetchOne: async (id: number): Promise<T> => {
      const res = await apiClient.get(`${path}/${id}`);
      return res.data.data.attributes;
    },
    create: async (body: Partial<T>): Promise<T> => {
      const res = await apiClient.post(path, body);
      return res.data.data.attributes;
    },
    update: async (id: number, body: Partial<T>): Promise<T> => {
      const res = await apiClient.patch(`${path}/${id}`, body);
      return res.data.data.attributes;
    },
    destroy: async (id: number): Promise<void> => {
      await apiClient.delete(`${path}/${id}`);
    },
  };
}