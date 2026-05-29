import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateImage, useDeleteImage } from '../hooks/useImages';
import { useListAlbum } from '@/features/albums/albums';
import type { Image } from '../types/image';

const schema = z.object({
  title: z.string().min(1, 'Required'),
  description: z.string(),
  tags: z.string(),
  album_id: z.string(),
});

type FormData = z.infer<typeof schema>;

type Props = {
  image: Image;
  onClose: () => void;
  initialMode?: 'edit' | 'delete';
};

export function ImageEditModal({ image, onClose, initialMode = 'edit' }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(initialMode === 'delete');
  const { mutate, isPending, isError } = useUpdateImage(image.album_id);
  const { mutate: deleteImage, isPending: isDeletePending, isError: isDeleteError } = useDeleteImage();
  const { data: albums = [] } = useListAlbum();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: image.title,
      description: image.description ?? '',
      tags: image.tags.join(', '),
      album_id: String(image.album_id),
    },
  });

  const onSubmit = (values: FormData) => {
    const tags = [...new Set(
      values.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
    )];

    mutate(
      {
        id: image.id,
        data: {
          title: values.title,
          description: values.description || undefined,
          tags,
          album_id: parseInt(values.album_id, 10) || image.album_id,
        },
      },
      { onSuccess: onClose }
    );
  };

  const handleDelete = () => {
    deleteImage({ id: image.id, albumId: image.album_id }, { onSuccess: onClose });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-edit-heading"
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="image-edit-modal"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        data-testid="image-edit-modal-overlay"
      />
      <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        {confirmDelete ? (
          <>
            <h2
              id="image-edit-heading"
              className="text-lg font-semibold text-gray-800 mb-2"
            >
              Delete image?
            </h2>
            <p className="text-sm text-gray-600 mb-1">
              &ldquo;{image.title}&rdquo; will be permanently removed from storage.
            </p>
            <p className="text-sm text-gray-500 mb-4">This cannot be undone.</p>

            {isDeleteError && (
              <p className="text-sm text-red-500 mb-4" data-testid="delete-image-error">
                Failed to delete. Please try again.
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={initialMode === 'delete' ? onClose : () => setConfirmDelete(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                data-testid="delete-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeletePending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors cursor-pointer"
                data-testid="delete-confirm-button"
              >
                {isDeletePending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              id="image-edit-heading"
              className="text-lg font-semibold text-gray-800 mb-4"
            >
              Edit image
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="edit-title" className="text-sm font-medium text-gray-700">Title</label>
                <input
                  id="edit-title"
                  {...register('title')}
                  type="text"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-title-input"
                />
                {errors.title && (
                  <p className="text-xs text-red-500" data-testid="edit-title-error">{errors.title.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-description" className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                  id="edit-description"
                  {...register('description')}
                  rows={3}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  data-testid="edit-description-input"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-tags" className="text-sm font-medium text-gray-700">Tags (comma-separated)</label>
                <input
                  id="edit-tags"
                  {...register('tags')}
                  type="text"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-tags-input"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-album" className="text-sm font-medium text-gray-700">Album</label>
                <select
                  id="edit-album"
                  {...register('album_id')}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-album-select"
                >
                  {albums.map((album) => (
                    <option key={album.id} value={String(album.id)}>{album.name}</option>
                  ))}
                </select>
              </div>

              {isError && (
                <p className="text-sm text-red-500" data-testid="image-edit-error">
                  Failed to save. Please try again.
                </p>
              )}

              <div className="flex justify-between items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors cursor-pointer"
                  data-testid="delete-image-button"
                >
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    data-testid="edit-cancel-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                    data-testid="edit-save-button"
                  >
                    {isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
