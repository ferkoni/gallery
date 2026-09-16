import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SubfolderSection } from '@/features/albums/components/SubfolderSection';
import { useInfiniteAlbums } from '@/features/albums/albums';
import type { Album } from '@/features/albums/types/album';

vi.mock('@/features/albums/albums', () => ({
  useInfiniteAlbums: vi.fn(),
  useGetAlbum: vi.fn(() => ({ data: undefined })),
  useUpdateAlbum: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
}));

const mockUseInfiniteAlbums = useInfiniteAlbums as Mock;
const fetchNextPage = vi.fn();

const folder = (id: number, name: string): Album => ({
  id, name, description: null, parent_id: 1, created_at: '2026-01-01',
});

function stubPages(pages: Album[][], hasNextPage = false) {
  mockUseInfiniteAlbums.mockReturnValue({
    data: { pages: pages.map(data => ({ data, meta: {} })) },
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage: false,
  });
}

let intersect: () => void;
function installIntersectionObserver() {
  intersect = () => {};
  vi.stubGlobal('IntersectionObserver', class {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe(node: Element) {
      intersect = () => this.callback(
        [{ isIntersecting: true, target: node } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
    disconnect() { intersect = () => {}; }
    unobserve() {}
  });
}

function renderSection() {
  return render(<MemoryRouter><SubfolderSection albumId={1} /></MemoryRouter>);
}

describe('SubfolderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installIntersectionObserver();
    stubPages([[ folder(2, 'Madrid') ]]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks for the children of the folder it is showing', () => {
    renderSection();
    expect(mockUseInfiniteAlbums).toHaveBeenCalledWith({ parentId: 1 });
  });

  it('renders a card per subfolder', () => {
    renderSection();
    expect(screen.getByTestId('album-card-2')).toBeInTheDocument();
  });

  it('renders nothing while the first page is still loading', () => {
    mockUseInfiniteAlbums.mockReturnValue({
      data: undefined, fetchNextPage, hasNextPage: false, isFetchingNextPage: false,
    });
    renderSection();

    expect(screen.queryByTestId('subfolder-section')).not.toBeInTheDocument();
  });

  it('renders nothing at all when the folder has none', () => {
    stubPages([[]]);
    renderSection();
    expect(screen.queryByTestId('subfolder-section')).not.toBeInTheDocument();
  });

  it('loads the next page when the sentinel scrolls into view', async () => {
    stubPages([[ folder(2, 'Madrid') ]], true);
    renderSection();

    intersect();

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  // The sentinel sits above the photo grid, so scrolling to the photos drags it through
  // the viewport. Left automatic it would cascade a request per page of the whole list.
  describe('after a few automatic pages', () => {
    const threePages = [
      [ folder(2, 'A') ], [ folder(3, 'B') ], [ folder(4, 'C') ],
    ];

    it('stops loading on scroll and asks instead', () => {
      stubPages(threePages, true);
      renderSection();

      expect(screen.queryByTestId('subfolder-sentinel')).not.toBeInTheDocument();
      expect(screen.getByTestId('subfolder-show-more')).toBeInTheDocument();
    });

    it('loads the next page when asked', async () => {
      stubPages(threePages, true);
      renderSection();

      await userEvent.click(screen.getByTestId('subfolder-show-more'));

      expect(fetchNextPage).toHaveBeenCalled();
    });
  });

  it('offers nothing more to load on the last page', () => {
    renderSection();
    expect(screen.queryByTestId('subfolder-sentinel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('subfolder-show-more')).not.toBeInTheDocument();
  });

  it('opens the edit modal for a subfolder', async () => {
    renderSection();

    await userEvent.click(screen.getByTestId('edit-album-button-2'));

    expect(screen.getByTestId('album-edit-modal')).toBeInTheDocument();
  });

  it('closes the edit modal again', async () => {
    renderSection();

    await userEvent.click(screen.getByTestId('edit-album-button-2'));
    await userEvent.click(screen.getByTestId('edit-cancel-button'));

    expect(screen.queryByTestId('album-edit-modal')).not.toBeInTheDocument();
  });
});
