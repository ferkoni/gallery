import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { ImageGrid } from '@/features/images/components/ImageGrid';
import { useAlbumImages } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';

vi.mock('@/features/images/hooks/useImages', () => ({
  useAlbumImages: vi.fn(),
  useUpdateImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
  useFavoriteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/useOnClickOutside', () => ({ useOnClickOutside: vi.fn() }));

vi.mock('@/features/albums/albums', () => ({
  useListAlbum: vi.fn(() => ({ data: [] })),
}));

const mockUseAlbumImages = useAlbumImages as Mock;

const meta = { current_page: 1, total_pages: 1, total_count: 2, per_page: 25 };

const images: Image[] = [
  { id: 1, title: 'Beach', description: null, tags: [], s3_key: 'k1', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1' },
  { id: 2, title: 'Mountain', description: null, tags: [], s3_key: 'k2', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url2' },
];

const pagedData: PaginatedResponse<Image> = { data: images, meta };

describe('ImageGrid', () => {
  it('shows skeleton loaders while pending', () => {
    mockUseAlbumImages.mockReturnValue({ isPending: true, isError: false, data: undefined });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('image-grid-skeleton')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-error')).toBeInTheDocument();
  });

  it('shows empty state when album has no images', () => {
    mockUseAlbumImages.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: [], meta: { ...meta, total_count: 0 } },
    });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-empty')).toBeInTheDocument();
  });

  it('renders a card for each image', () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('image-grid')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-2')).toBeInTheDocument();
  });

  it('does not show pagination when there is only one page', () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('shows pagination when there are multiple pages', () => {
    mockUseAlbumImages.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: images, meta: { ...meta, total_pages: 3 } },
    });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('opens the lightbox when an image card is clicked', async () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url1');
  });

  it('closes the lightbox when the overlay is clicked', async () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-overlay'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });

  it('opens the edit modal from the lightbox menu', async () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-edit'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('image-edit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-title-input')).toHaveValue('Beach');
  });

  it('opens the delete confirmation from the lightbox menu', async () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-delete'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('delete-confirm-button')).toBeInTheDocument();
  });

  it('closes the edit modal when the cancel button is clicked', async () => {
    mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
    render(<ImageGrid albumId={1} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-edit'));
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(screen.queryByTestId('image-edit-modal')).not.toBeInTheDocument();
  });

  describe('filter controls', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('renders title, tag and date filter inputs', () => {
      mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
      render(<ImageGrid albumId={1} />);
      expect(screen.getByPlaceholderText('Filter by title…')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Filter by tag…')).toBeInTheDocument();
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
    });

    it('passes title filter to useAlbumImages after debounce', () => {
      mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
      render(<ImageGrid albumId={1} />);

      fireEvent.change(screen.getByPlaceholderText('Filter by title…'), { target: { value: 'beach' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, 1, { title: 'beach', tag: undefined, from: undefined });
    });

    it('passes tag filter to useAlbumImages after debounce', () => {
      mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
      render(<ImageGrid albumId={1} />);

      fireEvent.change(screen.getByPlaceholderText('Filter by tag…'), { target: { value: 'sunset' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, 1, { title: undefined, tag: 'sunset', from: undefined });
    });

    it('passes from filter to useAlbumImages after debounce', () => {
      mockUseAlbumImages.mockReturnValue({ isPending: false, isError: false, data: pagedData });
      render(<ImageGrid albumId={1} />);

      fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-01-01' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, 1, { title: undefined, tag: undefined, from: '2026-01-01' });
    });

    it('resets to page 1 when a filter changes', () => {
      mockUseAlbumImages.mockReturnValue({
        isPending: false,
        isError: false,
        data: { data: images, meta: { ...meta, total_pages: 3 } },
      });
      render(<ImageGrid albumId={1} />);

      fireEvent.click(screen.getByTestId('pagination-next'));
      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, 2, expect.anything());

      fireEvent.change(screen.getByPlaceholderText('Filter by title…'), { target: { value: 'beach' } });
      act(() => { vi.advanceTimersByTime(300); });

      expect(mockUseAlbumImages).toHaveBeenLastCalledWith(1, 1, { title: 'beach', tag: undefined, from: undefined });
    });
  });
});
