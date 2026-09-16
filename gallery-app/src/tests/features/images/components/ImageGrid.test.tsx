import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { ImageGrid } from '@/features/images/components/ImageGrid';
import { useAlbumImages } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/hooks/useImages', () => ({
  useAlbumImages: vi.fn(),
  useUpdateImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
  useFavoriteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useOnClickOutside', () => ({ useOnClickOutside: vi.fn() }));

// ImageEditModal's folder picker reaches for these; the grid's own tests care about
// neither, so an empty forest and no named selection is enough.
vi.mock('@/features/albums/albums', () => ({
  useGetAlbum: vi.fn(() => ({ data: undefined })),
  useInfiniteAlbums: vi.fn(() => ({
    data: { pages: [{ data: [], meta: {} }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isPlaceholderData: false,
  })),
}));

const mockUseAlbumImages = useAlbumImages as Mock;

const images: Image[] = [
  { id: 1, title: 'Beach', description: null, tags: [], s3_key: 'k1', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1', thumbnail_url: 'https://thumb1' },
  { id: 2, title: 'Mountain', description: null, tags: [], s3_key: 'k2', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url2', thumbnail_url: 'https://thumb2' },
];

const fetchNextPage = vi.fn();

// What useAlbumImages returns once a folder has loaded: the photos flattened across pages.
const grid = (overrides: object = {}) => ({
  data: images, isPending: false, isLoadingError: false, isFetchNextPageError: false,
  hasNextPage: false, isFetchingNextPage: false, isPlaceholderData: false, fetchNextPage,
  ...overrides,
});

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

describe('ImageGrid', () => {
  beforeEach(() => fetchNextPage.mockReset());

  it('shows skeleton loaders while pending', () => {
    mockUseAlbumImages.mockReturnValue(grid({ isPending: true, data: undefined }));
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('image-grid-skeleton')).toBeInTheDocument();
  });

  it('shows error state when the first page fails', () => {
    mockUseAlbumImages.mockReturnValue(grid({ isLoadingError: true, data: undefined }));
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-error')).toBeInTheDocument();
  });

  it('shows empty state when album has no images', () => {
    mockUseAlbumImages.mockReturnValue(grid({ data: [] }));
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-empty')).toBeInTheDocument();
  });

  it('renders a card for each image', () => {
    mockUseAlbumImages.mockReturnValue(grid());
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('image-grid')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-2')).toBeInTheDocument();
  });

  it('opens the lightbox when an image card is clicked', async () => {
    mockUseAlbumImages.mockReturnValue(grid());
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url1');
  });

  it('closes the lightbox when the overlay is clicked', async () => {
    mockUseAlbumImages.mockReturnValue(grid());
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-overlay'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });

  it('opens the edit modal from the lightbox menu', async () => {
    mockUseAlbumImages.mockReturnValue(grid());
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-edit'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('image-edit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-title-input')).toHaveValue('Beach');
  });

  it('opens the delete confirmation from the lightbox menu', async () => {
    mockUseAlbumImages.mockReturnValue(grid());
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-delete'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('delete-confirm-button')).toBeInTheDocument();
  });

  it('closes the edit modal when the cancel button is clicked', async () => {
    mockUseAlbumImages.mockReturnValue(grid());
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-edit'));
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(screen.queryByTestId('image-edit-modal')).not.toBeInTheDocument();
  });

  describe('loading more photos', () => {
    beforeEach(() => installIntersectionObserver());
    afterEach(() => vi.unstubAllGlobals());

    it('asks for the next page when the end of the grid scrolls into view', () => {
      mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true }));
      render(<ImageGrid albumId={1} />);

      intersect();

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('shows that more are loading, and stops watching until they arrive', () => {
      mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true, isFetchingNextPage: true }));
      render(<ImageGrid albumId={1} />);

      intersect();

      expect(screen.getByTestId('image-grid-loading-more')).toBeInTheDocument();
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    // The rows on screen belong to the previous filter; the next page would be the new one's.
    it('does not page while showing the previous filter\'s photos', () => {
      mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true, isPlaceholderData: true }));
      render(<ImageGrid albumId={1} />);

      intersect();

      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('has nothing to watch once the last page is loaded', () => {
      mockUseAlbumImages.mockReturnValue(grid());
      render(<ImageGrid albumId={1} />);

      expect(screen.queryByTestId('image-grid-sentinel')).not.toBeInTheDocument();
    });

    describe('when a later page fails', () => {
      const failed = () => grid({ hasNextPage: true, isFetchNextPageError: true });

      it('keeps the photos already loaded and offers a retry', async () => {
        mockUseAlbumImages.mockReturnValue(failed());
        render(<ImageGrid albumId={1} />);

        expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
        expect(screen.queryByTestId('images-error')).not.toBeInTheDocument();

        await userEvent.click(within(screen.getByTestId('image-grid-load-more-error')).getByRole('button', { name: 'Retry' }));
        expect(fetchNextPage).toHaveBeenCalledTimes(1);
      });

      // Otherwise the failure re-arms the sentinel, and a sentinel still in view retries forever.
      it('stops watching the end of the grid', () => {
        mockUseAlbumImages.mockReturnValue(failed());
        render(<ImageGrid albumId={1} />);

        intersect();

        expect(fetchNextPage).not.toHaveBeenCalled();
      });
    });

    describe('in the lightbox', () => {
      it('asks for more from the last loaded photo', async () => {
        mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true }));
        render(<ImageGrid albumId={1} />);

        await userEvent.click(screen.getByTestId('image-card-2'));
        await userEvent.click(screen.getByTestId('lightbox-next'));

        expect(fetchNextPage).toHaveBeenCalledTimes(1);
      });

      // fetchNextPage restarts a request already in flight, so holding the arrow key would
      // otherwise resend the page on every repeat.
      it('does not ask again while the next page is on its way', async () => {
        mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true, isFetchingNextPage: true }));
        render(<ImageGrid albumId={1} />);

        await userEvent.click(screen.getByTestId('image-card-2'));
        await userEvent.click(screen.getByTestId('lightbox-next'));

        expect(fetchNextPage).not.toHaveBeenCalled();
      });
    });
  });

  describe('filter controls', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('renders title, tag and date filter inputs', () => {
      mockUseAlbumImages.mockReturnValue(grid());
      render(<ImageGrid albumId={1} />);
      expect(screen.getByPlaceholderText('Filter by title…')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Filter by tag…')).toBeInTheDocument();
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
    });

    it('passes title filter to useAlbumImages after debounce', () => {
      mockUseAlbumImages.mockReturnValue(grid());
      render(<ImageGrid albumId={1} />);

      fireEvent.change(screen.getByPlaceholderText('Filter by title…'), { target: { value: 'beach' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, { title: 'beach', tag: undefined, from: undefined });
    });

    it('passes tag filter to useAlbumImages after debounce', () => {
      mockUseAlbumImages.mockReturnValue(grid());
      render(<ImageGrid albumId={1} />);

      fireEvent.change(screen.getByPlaceholderText('Filter by tag…'), { target: { value: 'sunset' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, { title: undefined, tag: 'sunset', from: undefined });
    });

    // A new filter is a new query, so it starts from its own first page.
    it('passes from filter to useAlbumImages after debounce', () => {
      mockUseAlbumImages.mockReturnValue(grid());
      render(<ImageGrid albumId={1} />);

      fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-01-01' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, { title: undefined, tag: undefined, from: '2026-01-01' });
    });
  });
});
