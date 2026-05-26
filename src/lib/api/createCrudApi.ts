import apiClient from '@/lib/api/client';

export type PaginationMeta = {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: PaginationMeta;
};

export function createCrudApi<T>(path: string) {
  return {
    fetchAll: async (): Promise<T[]> => {
      const res = await apiClient.get(path);
      return res.data.data.map((item: { attributes: T }) => item.attributes);
    },
    fetchPaginated: async (page = 1): Promise<PaginatedResponse<T>> => {
      const res = await apiClient.get(path, { params: { page } });
      return {
        data: res.data.data.map((item: { attributes: T }) => item.attributes),
        meta: res.data.meta as PaginationMeta,
      };
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