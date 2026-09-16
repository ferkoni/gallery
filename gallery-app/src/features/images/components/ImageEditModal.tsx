import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateImage, useDeleteImage } from '../hooks/useImages';
import { AlbumPicker } from '@/features/albums/components/AlbumPicker';
import type { Image } from '../types/image';

const schema = z.object({
  title: z.string().min(1, 'Required'),
  description: z.string(),
  tags: z.string(),
  album_id: z.number(),
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

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: image.title,
      description: image.description ?? '',
      tags: image.tags.join(', '),
      album_id: image.album_id,
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
          album_id: values.album_id,
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
      <div className="relative z-10 bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        {confirmDelete ? (
          <>
            <h2
              id="image-edit-heading"
              className="text-lg font-semibold text-strong mb-2"
            >
              Delete image?
            </h2>
            <p className="text-sm text-secondary mb-1">
              &ldquo;{image.title}&rdquo; will be permanently removed from storage.
            </p>
            <p className="text-sm text-muted mb-4">This cannot be undone.</p>

            {isDeleteError && (
              <p className="text-sm text-danger mb-4" data-testid="delete-image-error">
                Failed to delete. Please try again.
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={initialMode === 'delete' ? onClose : () => setConfirmDelete(false)}
                className="flex-1 border border-control text-body font-semibold py-2 rounded-lg hover:bg-hover transition-colors cursor-pointer"
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
              className="text-lg font-semibold text-strong mb-4"
            >
              Edit image
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="edit-title" className="text-sm font-medium text-body">Title</label>
                <input
                  id="edit-title"
                  {...register('title')}
                  type="text"
                  className="border border-control rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                  data-testid="edit-title-input"
                />
                {errors.title && (
                  <p className="text-xs text-danger" data-testid="edit-title-error">{errors.title.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-description" className="text-sm font-medium text-body">Description</label>
                <textarea
                  id="edit-description"
                  {...register('description')}
                  rows={3}
                  className="border border-control rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus resize-none"
                  data-testid="edit-description-input"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="edit-tags" className="text-sm font-medium text-body">Tags (comma-separated)</label>
                <input
                  id="edit-tags"
                  {...register('tags')}
                  type="text"
                  className="border border-control rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
                  data-testid="edit-tags-input"
                />
              </div>

              <div className="flex flex-col gap-1">
                {/* No allowTopLevel: a photo has to live in a folder. */}
                <Controller
                  name="album_id"
                  control={control}
                  render={({ field }) => (
                    <AlbumPicker
                      label="Folder"
                      value={field.value}
                      onChange={(albumId) => field.onChange(albumId)}
                    />
                  )}
                />
              </div>

              {isError && (
                <p className="text-sm text-danger" data-testid="image-edit-error">
                  Failed to save. Please try again.
                </p>
              )}

              <div className="flex justify-between items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm text-danger hover:text-danger-strong font-medium transition-colors cursor-pointer"
                  data-testid="delete-image-button"
                >
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="border border-control text-body font-semibold px-4 py-2 rounded-lg hover:bg-hover transition-colors cursor-pointer"
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
