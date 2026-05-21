import { useGetAlbum, useUpdateAlbum } from "@/features/albums/albums.ts";
import { AlbumForm } from "@/features/albums/components/AlbumForm.tsx";
import { useNavigate, useParams } from "react-router-dom";

export function AlbumEditPage() {
  const { id } = useParams();
  const { data: album, isPending: isFetching, isError: isFetchError } = useGetAlbum(Number(id));
  const updateAlbum = useUpdateAlbum();
  const navigate = useNavigate();

  if (isFetching) return <p className="p-6 text-gray-500">Loading...</p>;
  if (isFetchError || !album) return <p className="p-6 text-red-500">Failed to load album.</p>;

  return (
    <AlbumForm
      title="Edit Album"
      submitLabel="Save"
      pendingLabel="Saving..."
      errorMessage="Failed to update album."
      isPending={updateAlbum.isPending}
      isError={updateAlbum.isError}
      defaultValues={{ name: album.name, description: album.description ?? "" }}
      onCancel={() => navigate('/albums')}
      onSubmit={(data) => updateAlbum.mutate({ id: album.id, body: data }, { onSuccess: () => navigate('/albums') })}
    />
  );
}
