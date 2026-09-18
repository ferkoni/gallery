import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosResponse } from 'axios';
import { ImageGrid } from '@/features/images/components/ImageGrid';
import { useAlbumImages, useMovingImages } from '@/features/images/hooks/useImages';
import { useSelectionStore } from '@/features/images/store/selectionStore';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/hooks/useImages', () => ({
  useAlbumImages: vi.fn(),
  useMoveImages: vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null })),
  useMovingImages: vi.fn(() => false),
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
const mockUseMovingImages = useMovingImages as Mock;

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
  beforeEach(() => {
    fetchNextPage.mockReset();
    mockUseMovingImages.mockReturnValue(false);
    useSelectionStore.getState().reset();
  });

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

  // The API refuses to list photos it cannot presign; the grid says why instead of "Failed".
  it('points to Settings when the first page fails for want of S3 credentials', () => {
    const error = new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', undefined, undefined,
      { status: 422, data: { errors: 'No S3 credentials on file' } } as AxiosResponse);
    mockUseAlbumImages.mockReturnValue(grid({ isLoadingError: true, data: undefined, error }));
    render(<MemoryRouter><ImageGrid albumId={1} /></MemoryRouter>);
    expect(within(screen.getByTestId('images-error')).getByRole('link', { name: 'Add them in Settings' }))
      .toHaveAttribute('href', '/settings/s3_credential');
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

  describe('selecting photos', () => {
    const check = (title: string) => screen.getByRole('checkbox', { name: `Select ${title}` });

    beforeEach(() => mockUseAlbumImages.mockReturnValue(grid()));

    it('shows no toolbar until something is selected', () => {
      render(<ImageGrid albumId={1} />);
      expect(screen.queryByTestId('selection-toolbar')).not.toBeInTheDocument();
    });

    it('counts what is checked', async () => {
      render(<ImageGrid albumId={1} />);

      await userEvent.click(check('Beach'));
      await userEvent.click(check('Mountain'));

      expect(screen.getByTestId('selection-toolbar')).toHaveTextContent('2 selected');
    });

    it('extends the selection to the shift-clicked photo', async () => {
      const three = [...images, { ...images[0], id: 3, title: 'Forest' }];
      mockUseAlbumImages.mockReturnValue(grid({ data: three }));
      render(<ImageGrid albumId={1} />);

      await userEvent.click(check('Beach'));
      fireEvent.click(check('Forest'), { shiftKey: true });

      expect(screen.getByTestId('selection-toolbar')).toHaveTextContent('3 selected');
    });

    it('selects every loaded photo from the toolbar', async () => {
      render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));

      await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));

      expect(screen.getByTestId('selection-toolbar')).toHaveTextContent('2 selected');
    });

    it('clears from the toolbar', async () => {
      render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));

      await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

      expect(screen.queryByTestId('selection-toolbar')).not.toBeInTheDocument();
    });

    // A filter hides photos, and a move must never include one that isn't on screen.
    it('clears when a filter changes', async () => {
      render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));

      fireEvent.change(screen.getByPlaceholderText('Filter by title…'), { target: { value: 'be' } });
      await act(async () => { await new Promise(r => setTimeout(r, 350)); });

      expect(screen.queryByTestId('selection-toolbar')).not.toBeInTheDocument();
    });

    it('drops a selected photo that is no longer loaded', async () => {
      const { rerender } = render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));
      await userEvent.click(check('Mountain'));

      mockUseAlbumImages.mockReturnValue(grid({ data: [images[1]] }));
      rerender(<ImageGrid albumId={1} />);

      expect(screen.getByTestId('selection-toolbar')).toHaveTextContent('1 selected');
    });

    it('clears on Escape', async () => {
      render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByTestId('selection-toolbar')).not.toBeInTheDocument();
    });

    // The Lightbox owns Escape while it is open: one keypress shouldn't close it and drop a
    // whole selection with it.
    it('keeps the selection when Escape closes the lightbox', async () => {
      render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));
      await userEvent.click(screen.getByRole('img', { name: 'Beach' }));

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.getByTestId('selection-toolbar')).toHaveTextContent('1 selected');
    });

    it('opens the move dialog with the selected photos', async () => {
      render(<ImageGrid albumId={1} />);
      await userEvent.click(check('Beach'));

      await userEvent.click(screen.getByTestId('move-images-button'));

      expect(screen.getByTestId('move-images-modal')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Move 1 photo' })).toBeInTheDocument();
    });
  });

  describe('while a move is running', () => {
    beforeEach(() => installIntersectionObserver());
    afterEach(() => vi.unstubAllGlobals());

    // The server has already moved the photos, so every later page has shifted up by that
    // many: a page fetched by number in the gap before the refetch would skip them.
    it('stops watching the end of the grid', () => {
      mockUseMovingImages.mockReturnValue(true);
      mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true }));
      render(<ImageGrid albumId={1} />);

      intersect();

      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('watches again once the move settles', () => {
      mockUseMovingImages.mockReturnValue(false);
      mockUseAlbumImages.mockReturnValue(grid({ hasNextPage: true }));
      render(<ImageGrid albumId={1} />);

      intersect();

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });
  });
});
