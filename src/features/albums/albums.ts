import { createCrudApi } from "@/lib/api/createCrudApi.ts";
import { createCrudHooks } from "@/lib/api/createCrudHooks.ts";
import type { Album } from "@/features/albums/types/album.ts";

const albumsApi = createCrudApi<Album>('/api/albums');
export const { useList: useListAlbum, useCreate: useCreateAlbum } = createCrudHooks<Album>('albums', albumsApi);