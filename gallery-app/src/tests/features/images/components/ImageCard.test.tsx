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
  s3_key: 'images/uuid/photo.jpg',
  album_id: 1,
  favorited: false,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://my-bucket.s3.amazonaws.com/images/uuid/photo.jpg?sig=abc',
  thumbnail_url: 'https://my-bucket.s3.amazonaws.com/images/uuid/photo.thumb.webp?sig=abc',
};

describe('ImageCard', () => {
  it('renders the image title', () => {
    render(<ImageCard image={image} />);
    expect(screen.getByText('Beach')).toBeInTheDocument();
  });

  it('renders the thumbnail, not the full-size original, with alt text', () => {
    render(<ImageCard image={image} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', image.thumbnail_url);
    expect(img).not.toHaveAttribute('src', image.url);
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

  it('calls onUnfavorite with the image when un-favoriting a favorited image', async () => {
    const onUnfavorite = vi.fn();
    render(<ImageCard image={{ ...image, favorited: true }} onUnfavorite={onUnfavorite} />);
    await userEvent.click(screen.getByTestId('favorite-button'));
    expect(onUnfavorite).toHaveBeenCalledWith(expect.objectContaining({ id: image.id }));
  });

  it('does not call onUnfavorite when favoriting an un-favorited image', async () => {
    const onUnfavorite = vi.fn();
    render(<ImageCard image={image} onUnfavorite={onUnfavorite} />);
    await userEvent.click(screen.getByTestId('favorite-button'));
    expect(onUnfavorite).not.toHaveBeenCalled();
  });

  describe('selection', () => {
    type Toggle = (image: Image, shiftKey: boolean) => void;
    const selection = (over: Partial<{ selected: boolean; showCheckbox: boolean }> = {}) => ({
      selected: false,
      showCheckbox: false,
      onToggle: vi.fn<Toggle>(),
      ...over,
    });

    it('renders no checkbox without the prop, so Search and Favorites are untouched', () => {
      render(<ImageCard image={image} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('renders a checkbox labelled with the photo when selection is given', () => {
      render(<ImageCard image={image} selection={selection()} />);
      expect(screen.getByRole('checkbox', { name: 'Select Beach' })).toBeInTheDocument();
    });

    it('calls onToggle without shift on a plain click, and not the card onClick', async () => {
      const props = selection();
      const onClick = vi.fn();
      render(<ImageCard image={image} onClick={onClick} selection={props} />);

      await userEvent.click(screen.getByRole('checkbox'));

      expect(props.onToggle).toHaveBeenCalledWith(image, false);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('passes shiftKey when the click held Shift', async () => {
      const props = selection();
      render(<ImageCard image={image} selection={props} />);

      fireEvent.click(screen.getByRole('checkbox'), { shiftKey: true });

      expect(props.onToggle).toHaveBeenCalledWith(image, true);
    });

    it('keeps the checkbox visible once anything is selected', () => {
      const { rerender } = render(<ImageCard image={image} selection={selection()} />);
      expect(screen.getByRole('checkbox').parentElement).toHaveClass('opacity-0');

      rerender(<ImageCard image={image} selection={selection({ showCheckbox: true })} />);
      expect(screen.getByRole('checkbox').parentElement).toHaveClass('opacity-100');
    });

    it('marks a selected card, in the checkbox and in the styling', () => {
      render(<ImageCard image={image} selection={selection({ selected: true, showCheckbox: true })} />);

      expect(screen.getByRole('checkbox')).toBeChecked();
      expect(screen.getByTestId('image-card-1')).toHaveClass('ring-2', 'ring-focus');
    });
  });
});
