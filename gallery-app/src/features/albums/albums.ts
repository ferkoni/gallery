import { useInfiniteQuery } from "@tanstack/react-query";
import { createCrudApi } from "@/lib/api/createCrudApi.ts";
import { createCrudHooks } from "@/lib/api/createCrudHooks.ts";
import { fetchAlbumPage } from "@/features/albums/api/albumsApi.ts";
import type { Album } from "@/features/albums/types/album.ts";

const albumsApi = createCrudApi<Album>('/api/albums');
export const {
  usePagedList: usePagedListAlbum,
  useGet: useGetAlbum,
  useCreate: useCreateAlbum,
  useUpdate: useUpdateAlbum,
} = createCrudHooks<Album>('albums', albumsApi);

// The picker's data: one page at a time, filtered by name server-side. The key sits under
// the ['albums'] prefix, so useCreateAlbum and useUpdateAlbum already invalidate it.
export function useInfiniteAlbums(q?: string) {
  return useInfiniteQuery({
    queryKey: ['albums', 'infinite', q ?? ''],
    queryFn: ({ pageParam }) => fetchAlbumPage(pageParam, q),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.total_pages ? last.meta.current_page + 1 : undefined,
  });
}
