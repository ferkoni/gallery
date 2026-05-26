import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ImageCard } from '@/features/images/components/ImageCard';
import type { Image } from '@/features/images/types/image';

const image: Image = {
  id: 1,
  title: 'Beach',
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
});
