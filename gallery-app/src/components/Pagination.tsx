type Props = {
  currentPage: number;
  totalPages: number;
  onNext: () => void;
  onPrev: () => void;
};

export function Pagination({ currentPage, totalPages, onNext, onPrev }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-6" data-testid="pagination">
      <button
        onClick={onPrev}
        disabled={currentPage <= 1}
        className="px-4 py-2 text-sm font-medium text-body bg-surface border border-control rounded-lg hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        data-testid="pagination-prev"
      >
        ← Prev
      </button>
      <span className="text-sm text-muted" data-testid="pagination-info">
        {currentPage} / {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={currentPage >= totalPages}
        className="px-4 py-2 text-sm font-medium text-body bg-surface border border-control rounded-lg hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        data-testid="pagination-next"
      >
        Next →
      </button>
    </div>
  );
}
