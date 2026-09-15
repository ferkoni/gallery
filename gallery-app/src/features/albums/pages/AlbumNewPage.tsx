import { useCreateAlbum } from "@/features/albums/albums.ts";
import { AlbumForm } from "@/features/albums/components/AlbumForm.tsx";
import { useNavigate } from "react-router-dom";

export function AlbumNewPage() {
  const createAlbum = useCreateAlbum();
  const navigate = useNavigate();

  return (
    <AlbumForm
      title="New Folder"
      submitLabel="Create"
      pendingLabel="Creating..."
      errorMessage="Failed to create folder."
      isPending={createAlbum.isPending}
      isError={createAlbum.isError}
      onCancel={() => navigate('/folders')}
      onSubmit={(data) => createAlbum.mutate(data, { onSuccess: () => navigate('/folders') })}
    />
  );
}
