import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { ImageCard } from '@/features/images/components/ImageCard';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/hooks/useImages', () => ({
  useFavoriteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const image: Image = {
  id: 1,
  title: 'Beach',
  description: null,
  tags: [],
  s3_key: 'albums/1/uuid/photo.jpg',
  album_id: 1,
  favorited: false,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://my-bucket.s3.amazonaws.com/albums/1/uuid/photo.jpg?sig=abc',
};

describe('ImageCard', () => {
  it('renders the image title', () => {
    render(<ImageCard image={image} />);
    expect(screen.getByText('Beach')).toBeInTheDocument();
  });

  it('renders an img with the presigned url and alt text', () => {
    render(<ImageCard image={image} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', image.url);
    expect(img).toHaveAttribute('alt', 'Beach');
  });

  it('shows the formatted upload date', () => {
    render(<ImageCard image={image} />);
    expect(screen.getByTestId('image-date-1')).toHaveTextContent('Jan 1, 2026');
  });

  it('shows the broken-image fallback when the img fails to load', () => {
    render(<ImageCard image={image} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('image-broken')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('calls onClick when the card is clicked', async () => {
    const onClick = vi.fn();
    render(<ImageCard image={image} onClick={onClick} />);
    await userEvent.click(screen.getByTestId('image-card-1'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders without onClick without errors', () => {
    render(<ImageCard image={image} />);
    expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
  });

  it('renders heart button with add-to-favorites label when not favorited', () => {
    render(<ImageCard image={image} />);
    expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();
  });

  it('renders heart button with remove-from-favorites label when favorited', () => {
    render(<ImageCard image={{ ...image, favorited: true }} />);
    expect(screen.getByRole('button', { name: /remove from favorites/i })).toBeInTheDocument();
  });

  it('clicking the heart button does not trigger the card onClick', async () => {
    const onClick = vi.fn();
    render(<ImageCard image={image} onClick={onClick} />);
    await userEvent.click(screen.getByTestId('favorite-button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
