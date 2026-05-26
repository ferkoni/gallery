import { useState } from 'react';

export function usePagination() {
  const [page, setPage] = useState(1);

  return {
    page,
    goNext: () => setPage((p) => p + 1),
    goPrev: () => setPage((p) => Math.max(p - 1, 1)),
    goToPage: setPage,
    reset: () => setPage(1),
  };
}
