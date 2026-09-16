import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateAlbum } from '@/features/albums/albums';
import { AlbumPicker } from './AlbumPicker';
import { apiErrorMessage } from '@/lib/api/errorMessage';
import type { Album } from '../types/album';

const schema = z.object({
  name: z.string().min(1, 'Required').max(50),
  description: z.string().max(500).optional(),
  // undefined is the top level, which is a destination like any other here.
  parent_id: z.number().optional(),
});

type FormData = z.infer<typeof schema>;

type Props = {
  album: Album;
  onClose: () => void;
};

export function AlbumEditModal({ album, onClose }: Props) {
  const { mutate, isPending, isError, error } = useUpdateAlbum();

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: album.name,
      description: album.description ?? '',
      parent_id: album.parent_id ?? undefined,
    },
  });

  const onSubmit = ({ parent_id, ...values }: FormData) => {
    // parent_id is sent only when it changed: an omitted key leaves the folder where it
    // is, so a rename never races a move it did not ask for. null is the top level.
    const moved = (parent_id ?? null) !== album.parent_id;

    mutate(
      { id: album.id, body: moved ? { ...values, parent_id: parent_id ?? null } : values },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-edit-heading"
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="album-edit-modal"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        data-testid="album-edit-modal-overlay"
      />
      <div className="relative z-10 bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2
          id="album-edit-heading"
          className="text-lg font-semibold text-strong mb-4"
        >
          Edit folder
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-name" className="text-sm font-medium text-body">Name</label>
            <input
              id="edit-name"
              {...register('name')}
              type="text"
              className="border border-control rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
              data-testid="edit-name-input"
            />
            {errors.name && (
              <p className="text-xs text-danger" data-testid="edit-name-error">{errors.name.message}</p>
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
            <Controller
              name="parent_id"
              control={control}
              render={({ field }) => (
                <AlbumPicker
                  label="Location"
                  value={field.value}
                  onChange={field.onChange}
                  allowTopLevel
                  // The folder cannot be moved inside itself, so it and its subfolders are
                  // dropped from what the picker can reach, by browsing or by searching.
                  disabledId={album.id}
                />
              )}
            />
          </div>

          {isError && (
            <p className="text-sm text-danger" data-testid="album-edit-error">
              {apiErrorMessage(error, 'Failed to save. Please try again.')}
            </p>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-control text-body font-semibold py-2 rounded-lg hover:bg-hover transition-colors cursor-pointer"
              data-testid="edit-cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors cursor-pointer"
              data-testid="edit-save-button"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
