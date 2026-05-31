import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { FavoritesPage } from '@/features/images/pages/FavoritesPage';
import { useFavoriteImages, useFavoriteImage } from '@/features/images/hooks/useImages';
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
};

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
});
