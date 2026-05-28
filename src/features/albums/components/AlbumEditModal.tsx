import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateAlbum } from '@/features/albums/albums';
import type { Album } from '../types/album';

const schema = z.object({
  name: z.string().min(1, 'Required').max(50),
  description: z.string().max(500).optional(),
});

type FormData = z.infer<typeof schema>;

type Props = {
  album: Album;
  onClose: () => void;
};

export function AlbumEditModal({ album, onClose }: Props) {
  const { mutate, isPending, isError } = useUpdateAlbum();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: album.name,
      description: album.description ?? '',
    },
  });

  const onSubmit = (values: FormData) => {
    mutate(
      { id: album.id, body: values },
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
      <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2
          id="album-edit-heading"
          className="text-lg font-semibold text-gray-800 mb-4"
        >
          Edit album
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-name" className="text-sm font-medium text-gray-700">Name</label>
            <input
              id="edit-name"
              {...register('name')}
              type="text"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="edit-name-input"
            />
            {errors.name && (
              <p className="text-xs text-red-500" data-testid="edit-name-error">{errors.name.message}</p>
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

          {isError && (
            <p className="text-sm text-red-500" data-testid="album-edit-error">
              Failed to save. Please try again.
            </p>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors"
              data-testid="edit-cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors"
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
