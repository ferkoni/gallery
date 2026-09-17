import { MAX_MOVE } from '../api/imagesApi';

type Props = {
  count: number;
  loadedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onMove: () => void;
  moving: boolean;
};

export function SelectionToolbar({ count, loadedCount, onSelectAll, onClear, onMove, moving }: Props) {
  if (count === 0) return null;

  const tooMany = count > MAX_MOVE;

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      // Sticky, so it stays reachable however far the grid has been scrolled.
      className="sticky top-0 z-20 flex items-center gap-3 flex-wrap bg-surface border-b border-subtle px-1 py-3 mt-4"
      data-testid="selection-toolbar"
    >
      <span className="text-sm font-medium text-body" aria-live="polite">
        {count} selected
      </span>

      {count < loadedCount && (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-sm text-link hover:text-link-strong font-medium cursor-pointer"
        >
          Select all ({loadedCount})
        </button>
      )}

      <button
        type="button"
        onClick={onClear}
        className="text-sm text-secondary hover:text-strong cursor-pointer"
      >
        Clear
      </button>

      <button
        type="button"
        onClick={onMove}
        disabled={moving || tooMany}
        className="ml-auto text-sm px-3 py-2 rounded-lg border border-control text-secondary hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        data-testid="move-images-button"
      >
        Move to…
      </button>

      {/* The server refuses a bigger batch, and splitting one would break all-or-nothing. */}
      {tooMany && (
        <span className="text-xs text-muted w-full" data-testid="move-limit-hint">
          Move up to {MAX_MOVE} photos at a time
        </span>
      )}
    </div>
  );
}
