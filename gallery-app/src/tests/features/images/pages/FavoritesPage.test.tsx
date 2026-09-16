import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { FavoritesPage } from '@/features/images/pages/FavoritesPage';
import { useFavoriteImages } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';

const { mockToggleFavorite } = vi.hoisted(() => ({
  mockToggleFavorite: vi.fn(),
}));

vi.mock('@/features/images/hooks/useImages', () => ({
  useFavoriteImages: vi.fn(),
  useFavoriteImage: vi.fn(() => ({ mutate: mockToggleFavorite, isPending: false })),
}));

const mockUseFavoriteImages = useFavoriteImages as Mock;

const favImage: Image = {
  id: 1,
  title: 'Beach',
  description: null,
  tags: [],
  s3_key: 'k1',
  album_id: 1,
  favorited: true,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://url1',
  thumbnail_url: 'https://thumb1',
};

let intersect: () => void;
// The no-op observer from setup.ts never fires. This one hands the test a trigger for the
// element it is observing, as SubfolderSection.test.tsx does.
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

function renderPage() {
  return render(<FavoritesPage />);
}

describe('FavoritesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton while loading', () => {
    mockUseFavoriteImages.mockReturnValue({ isPending: true, isError: false, data: undefined });
    renderPage();
    expect(screen.getByTestId('favorites-skeleton')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', () => {
    mockUseFavoriteImages.mockReturnValue({ isPending: false, isError: true, data: undefined });
    renderPage();
    expect(screen.getByText('Failed to load favorites.')).toBeInTheDocument();
  });

  it('renders empty state when there are no favorites', () => {
    mockUseFavoriteImages.mockReturnValue({ isPending: false, isError: false, data: [] });
    renderPage();
    expect(screen.getByTestId('favorites-empty')).toBeInTheDocument();
  });

  it('renders the favorites grid with images', () => {
    mockUseFavoriteImages.mockReturnValue({ isPending: false, isError: false, data: [favImage] });
    renderPage();
    expect(screen.getByTestId('favorites-grid')).toBeInTheDocument();
    expect(screen.getByText('Beach')).toBeInTheDocument();
  });

  describe('undo toast', () => {
    beforeEach(() => {
      mockUseFavoriteImages.mockReturnValue({ isPending: false, isError: false, data: [favImage] });
    });

    it('shows toast when an image is un-favorited', async () => {
      renderPage();
      await userEvent.click(screen.getByTestId('favorite-button'));
      expect(screen.getByText('Removed from favorites')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    });

    it('hides toast and re-favorites when Undo is clicked', async () => {
      renderPage();
      await userEvent.click(screen.getByTestId('favorite-button'));
      await userEvent.click(screen.getByRole('button', { name: /undo/i }));
      expect(mockToggleFavorite).toHaveBeenCalledWith({ id: favImage.id, favorited: true });
      expect(screen.queryByText('Removed from favorites')).not.toBeInTheDocument();
    });

    it('hides toast when the dismiss button is clicked', async () => {
      renderPage();
      await userEvent.click(screen.getByTestId('favorite-button'));
      await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(screen.queryByText('Removed from favorites')).not.toBeInTheDocument();
    });

    describe('timer behavior', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('auto-dismisses toast after 7 seconds', () => {
        renderPage();
        fireEvent.click(screen.getByTestId('favorite-button'));
        expect(screen.getByText('Removed from favorites')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(7000); });
        expect(screen.queryByText('Removed from favorites')).not.toBeInTheDocument();
      });

      it('resets the auto-dismiss timer when a second image is un-favorited', () => {
        const secondImage: Image = { ...favImage, id: 2, title: 'Mountain' };
        mockUseFavoriteImages.mockReturnValue({
          isPending: false,
          isError: false,
          data: [favImage, secondImage],
        });
        renderPage();
        const [firstButton, secondButton] = screen.getAllByTestId('favorite-button');
        fireEvent.click(firstButton);
        act(() => { vi.advanceTimersByTime(5000); });
        fireEvent.click(secondButton);
        act(() => { vi.advanceTimersByTime(5000); }); // 10s from first click, 5s from second — still visible
        expect(screen.getByText('Removed from favorites')).toBeInTheDocument();
        act(() => { vi.advanceTimersByTime(2000); }); // 7s from second click — should dismiss
        expect(screen.queryByText('Removed from favorites')).not.toBeInTheDocument();
      });

      it('clears the timer on unmount without errors', () => {
        const { unmount } = renderPage();
        fireEvent.click(screen.getByTestId('favorite-button'));
        unmount();
        act(() => { vi.advanceTimersByTime(7000); }); // no error or state update after unmount
      });
    });
  });

  describe('loading more favourites', () => {
    const fetchNextPage = vi.fn();
    const favourites = (overrides: object) => ({
      data: [favImage], isPending: false, isError: false,
      hasNextPage: true, isFetchingNextPage: false, fetchNextPage,
      ...overrides,
    });

    beforeEach(() => installIntersectionObserver());
    afterEach(() => vi.unstubAllGlobals());

    // The regression test for bugs.md bug 3: only the first 25 favourites were ever reachable.
    it('asks for the next page when the end of the grid scrolls into view', () => {
      mockUseFavoriteImages.mockReturnValue(favourites({}));
      renderPage();

      intersect();

      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('shows that more are loading, and stops watching until they arrive', () => {
      mockUseFavoriteImages.mockReturnValue(favourites({ isFetchingNextPage: true }));
      renderPage();

      intersect();

      expect(screen.getByTestId('favorites-loading-more')).toBeInTheDocument();
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it('has nothing to watch once the last page is loaded', () => {
      mockUseFavoriteImages.mockReturnValue(favourites({ hasNextPage: false }));
      renderPage();

      expect(screen.queryByTestId('favorites-sentinel')).not.toBeInTheDocument();
    });
  });
});
