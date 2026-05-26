import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { ImageGrid } from '@/features/images/components/ImageGrid';
import { useImages } from '@/features/images/hooks/useImages';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/hooks/useImages');
const mockUseImages = useImages as Mock;

const images: Image[] = [
  { id: 1, title: 'Beach', s3_key: 'k1', album_id: 1, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1' },
  { id: 2, title: 'Mountain', s3_key: 'k2', album_id: 1, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url2' },
];

describe('ImageGrid', () => {
  it('shows loading state while pending', () => {
    mockUseImages.mockReturnValue({ isPending: true, isError: false, data: undefined });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-loading')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    mockUseImages.mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-error')).toBeInTheDocument();
  });

  it('renders nothing when data is undefined after guards', () => {
    mockUseImages.mockReturnValue({ isPending: false, isError: false, data: undefined });
    const { container } = render(<ImageGrid albumId={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows empty state when album has no images', () => {
    mockUseImages.mockReturnValue({ isPending: false, isError: false, data: [] });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('images-empty')).toBeInTheDocument();
  });

  it('renders a card for each image', () => {
    mockUseImages.mockReturnValue({ isPending: false, isError: false, data: images });
    render(<ImageGrid albumId={1} />);
    expect(screen.getByTestId('image-grid')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-2')).toBeInTheDocument();
  });
});
