import { describe, expect, vi, afterEach, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AlbumListPage } from "@/features/albums/pages/AlbumListPage.tsx";
import { useInfiniteAlbums } from '@/features/albums/albums';
import { MemoryRouter } from 'react-router-dom';
import { userEvent } from "@testing-library/user-event";
import type { Album } from "@/features/albums/types/album";

vi.mock('@/features/albums/albums', () => ({
  // The page lists the top level; the edit modal's Location picker reaches for the same hook.
  useInfiniteAlbums: vi.fn(),
  useGetAlbum: vi.fn(() => ({ data: undefined })),
  useUpdateAlbum: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
}));

const mockUseInfiniteAlbums = useInfiniteAlbums as Mock;
const fetchNextPage = vi.fn();

const meta = { current_page: 1, total_pages: 1, total_count: 2, per_page: 25 };

// What useInfiniteAlbums returns once loaded, with each array one page of folders.
function folders(pages: Album[][], overrides: object = {}) {
  return {
    data: { pages: pages.map(data => ({ data, meta })), pageParams: pages.map((_, i) => i + 1) },
    isPending: false, isLoadingError: false, isFetchNextPageError: false,
    hasNextPage: false, isFetchingNextPage: false, isPlaceholderData: false, fetchNextPage,
    ...overrides,
  };
}

let intersect: () => void;
// The no-op observer from setup.ts never fires. This one hands the test a trigger for the
// element it is observing, as FavoritesPage.test.tsx does.
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

describe("AlbumListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the top level, which has no parent', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(mockUseInfiniteAlbums).toHaveBeenCalledWith({});
  });

  it('renders Loading... while fetching', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([], { isPending: true, data: undefined }));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId("loading-label")).toBeInTheDocument();
  });

  it('renders Failed to load folders. when the first page fails', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([], { isLoadingError: true, data: undefined }));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId("failed-label")).toBeInTheDocument();
  });

  it('renders No folders yet. on empty data', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId("no-album-label")).toBeInTheDocument();
  });

  it('has a link to the detail page for each album card', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[{ id: 10, name: 'AlbumTest', description: null, parent_id: null, created_at: '' }]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'AlbumTest' })).toHaveAttribute('href', '/folders/10');
  });

  it('renders album cards with items and button', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[
      { id: 10, name: 'AlbumTest', description: 'some-album-description', parent_id: null, created_at: '' },
      { id: 15, name: 'AlbumWithNoDescription', description: null, parent_id: null, created_at: '' },
    ]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId('album-new-link')).toBeInTheDocument();
    expect(screen.getByTestId('album-name-10')).toHaveTextContent('AlbumTest');
    expect(screen.getByTestId('album-name-15')).toHaveTextContent('AlbumWithNoDescription');
    expect(screen.getByTestId('album-description-10')).toHaveTextContent('some-album-description');
    expect(screen.queryByTestId('album-description-15')).toBeNull();
  });

  it('renders an edit button for each album card', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[
      { id: 10, name: 'AlbumTest', description: null, parent_id: null, created_at: '' },
      { id: 15, name: 'Another', description: null, parent_id: null, created_at: '' },
    ]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId('edit-album-button-10')).toBeInTheDocument();
    expect(screen.getByTestId('edit-album-button-15')).toBeInTheDocument();
  });

  it('opens the edit modal when the edit button is clicked', async () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[{ id: 10, name: 'AlbumTest', description: null, parent_id: null, created_at: '' }]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    await userEvent.click(screen.getByTestId('edit-album-button-10'));
    expect(screen.getByTestId('album-edit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-name-input')).toHaveValue('AlbumTest');
  });

  it('closes the edit modal when the cancel button is clicked', async () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([[{ id: 10, name: 'AlbumTest', description: null, parent_id: null, created_at: '' }]]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    await userEvent.click(screen.getByTestId('edit-album-button-10'));
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(screen.queryByTestId('album-edit-modal')).not.toBeInTheDocument();
  });

  it('lists every loaded page of folders as one list', () => {
    mockUseInfiniteAlbums.mockReturnValue(folders([
      [{ id: 1, name: 'A', description: null, parent_id: null, created_at: '' }],
      [{ id: 2, name: 'B', description: null, parent_id: null, created_at: '' }],
    ]));
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId('album-name-1')).toBeInTheDocument();
    expect(screen.getByTestId('album-name-2')).toBeInTheDocument();
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  describe('loading more folders', () => {
    const one: Album = { id: 1, name: 'A', description: null, parent_id: null, created_at: '' };

    beforeEach(() => installIntersectionObserver());
    afterEach(() => vi.unstubAllGlobals());

    it('asks for the next page when the end of the list scrolls into view', () => {
      mockUseInfiniteAlbums.mockReturnValue(folders([[one]], { hasNextPage: true }));
      render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

      intersect();

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('shows that more are loading, and stops watching until they arrive', () => {
      mockUseInfiniteAlbums.mockReturnValue(folders([[one]], { hasNextPage: true, isFetchingNextPage: true }));
      render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

      intersect();

      expect(screen.getByTestId('album-list-loading-more')).toBeInTheDocument();
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('has nothing to watch once the last page is loaded', () => {
      mockUseInfiniteAlbums.mockReturnValue(folders([[one]]));
      render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

      expect(screen.queryByTestId('album-list-sentinel')).not.toBeInTheDocument();
    });

    describe('when a later page fails', () => {
      const failed = () => folders([[one]], { hasNextPage: true, isFetchNextPageError: true });

      it('keeps the folders already loaded and offers a retry', async () => {
        mockUseInfiniteAlbums.mockReturnValue(failed());
        render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

        expect(screen.getByTestId('album-name-1')).toBeInTheDocument();
        expect(screen.queryByTestId('failed-label')).not.toBeInTheDocument();

        await userEvent.click(within(screen.getByTestId('album-list-load-more-error')).getByRole('button', { name: 'Retry' }));
        expect(fetchNextPage).toHaveBeenCalledTimes(1);
      });

      // Otherwise the failure re-arms the sentinel, and a sentinel still in view retries forever.
      it('stops watching the end of the list', () => {
        mockUseInfiniteAlbums.mockReturnValue(failed());
        render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

        intersect();

        expect(fetchNextPage).not.toHaveBeenCalled();
      });
    });
  });
});
