import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { ImageGrid } from '@/features/images/components/ImageGrid';
import { useAlbumImages } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';
import type { PaginatedResponse } from '@/lib/api/createCrudApi';

vi.mock('@/features/images/hooks/useImages');
const mockUseAlbumImages = useAlbumImages as Mock;

const meta = { current_page: 1, total_pages: 1, total_count: 2, per_page: 25 };

const images: Image[] = [
  { id: 1, title: 'Beach', s3_key: 'k1', album_id: 1, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1' },
  { id: 2, title: 'Mountain', s3_key: 'k2', album_id: 1, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url2' },
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
});
