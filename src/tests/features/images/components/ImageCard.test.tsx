import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { ImageCard } from '@/features/images/components/ImageCard';
import type { Image } from '@/features/images/types/image';

const image: Image = {
  id: 1,
  title: 'Beach',
  description: null,
  tags: [],
  s3_key: 'albums/1/uuid/photo.jpg',
  album_id: 1,
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

  it('shows the edit button when onEdit is provided', () => {
    render(<ImageCard image={image} onEdit={vi.fn()} />);
    expect(screen.getByTestId('edit-image-button-1')).toBeInTheDocument();
  });

  it('does not show the edit button when onEdit is not provided', () => {
    render(<ImageCard image={image} />);
    expect(screen.queryByTestId('edit-image-button-1')).not.toBeInTheDocument();
  });

  it('calls onEdit when the edit button is clicked', async () => {
    const onEdit = vi.fn();
    render(<ImageCard image={image} onEdit={onEdit} />);
    await userEvent.click(screen.getByTestId('edit-image-button-1'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('does not call onClick when the edit button is clicked', async () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    render(<ImageCard image={image} onClick={onClick} onEdit={onEdit} />);
    await userEvent.click(screen.getByTestId('edit-image-button-1'));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});
