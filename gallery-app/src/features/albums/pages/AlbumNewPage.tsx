import { useCreateAlbum } from "@/features/albums/albums.ts";
import { AlbumForm } from "@/features/albums/components/AlbumForm.tsx";
import { useNavigate, useSearchParams } from "react-router-dom";

export function AlbumNewPage() {
  const createAlbum = useCreateAlbum();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // The parent comes from "New folder here" and nowhere else — there is no Location field
  // on this page. A foreign or invalid id comes back as a 404 and shows the same failure
  // message as any other.
  const parent = searchParams.get('parent');
  const parentId = parent ? Number(parent) : undefined;
  const back = () => navigate(parentId === undefined ? '/folders' : `/folders/${parentId}`);

  return (
    <AlbumForm
      title="New Folder"
      submitLabel="Create"
      pendingLabel="Creating..."
      errorMessage="Failed to create folder."
      isPending={createAlbum.isPending}
      isError={createAlbum.isError}
      onCancel={back}
      onSubmit={(data) =>
        createAlbum.mutate({ ...data, parent_id: parentId ?? null }, { onSuccess: back })
      }
    />
  );
}
