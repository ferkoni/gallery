import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createCrudApi } from "@/lib/api/createCrudApi.ts";

export function createCrudHooks<T extends { id: number }>(
  queryKey: string,
  api: ReturnType<typeof createCrudApi<T>>
) {
  function useList() {
    return useQuery({ queryKey: [queryKey], queryFn: api.fetchAll });
  }

  function usePagedList(page: number) {
    return useQuery({
      queryKey: [queryKey, { page }],
      queryFn: () => api.fetchPaginated(page),
    });
  }

  function useGet(id: number, options?: { enabled?: boolean }) {
    return useQuery({
      queryKey: [queryKey, id],
      queryFn: () => api.fetchOne(id),
      enabled: options?.enabled,
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: api.create,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<T> }) => api.update(id, body),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    });
  }

  function useDestroy() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: api.destroy,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    });
  }

  return { useList, usePagedList, useGet, useCreate, useUpdate, useDestroy };
}