import { useState } from 'react';
import { AlbumPicker } from '@/features/albums/components/AlbumPicker';
import { useGetAlbum } from '@/features/albums/albums';
import { apiErrorMessage } from '@/lib/api/errorMessage';
import { useMoveImages } from '../hooks/useImages';

type Props = { ids: number[]; from: number; onClose: () => void };

export function MoveImagesModal({ ids, from, onClose }: Props) {
  const [target, setTarget] = useState<number | undefined>(undefined);
  const { mutate, isPending, error } = useMoveImages();
  // The folder the photos are in, already cached by the page, ancestors and all.
  const { data: current, isPending: currentPending } = useGetAlbum(from);
  // Already cached by the picker that just listed it, so this costs no request.
  const { data: targetAlbum } = useGetAlbum(target ?? 0, { enabled: target !== undefined });

  const sameFolder = target === from;
  const n = ids.length;

  // Undefined until there is somewhere to move to, which is also what disables the button: one
  // expression decides both, so a Move with no destination has no handler to run.
  const to = target === undefined || sameFolder
    ? undefined
    : { id: target, name: targetAlbum?.name ?? '' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-images-heading"
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="move-images-modal"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        data-testid="move-images-modal-overlay"
      />
      <div className="relative z-10 bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 id="move-images-heading" className="text-lg font-semibold text-strong mb-4">
          Move {n} photo{n === 1 ? '' : 's'}
        </h2>

        {/* The picker opens inside the current folder, where its subfolders are already loaded
            for the page. It waits for the folder so that it opens there rather than at the top:
            its level is only read once, when it mounts. If the folder can't be loaded, it opens
            at the top as it always did. */}
        {currentPending ? (
          <p className="text-sm text-muted" data-testid="move-images-loading">Loading folders…</p>
        ) : (
          <AlbumPicker
            label="Folder"
            value={target}
            onChange={setTarget}
            initialPath={current && [ ...(current.ancestors ?? []), { id: current.id, name: current.name } ]}
          />
        )}

        {sameFolder && (
          <p className="text-sm text-muted mt-2" data-testid="move-same-folder">
            They&rsquo;re already in this folder
          </p>
        )}

        {/* The dialog stays open on a failure: the photos are still selected, and the folder
            chosen is still the one they wanted (docs: select-and-move/02, decision 12). */}
        {error && (
          <p className="text-sm text-danger mt-2" data-testid="move-images-error">
            {apiErrorMessage(error, "Couldn't move the photos. Try again.")}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-control text-body font-semibold py-2 rounded-lg hover:bg-hover transition-colors cursor-pointer"
            data-testid="move-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={to && (() => mutate({ ids, from, to }, { onSuccess: onClose }))}
            disabled={to === undefined || isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors cursor-pointer"
            data-testid="move-confirm-button"
          >
            {isPending ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}
