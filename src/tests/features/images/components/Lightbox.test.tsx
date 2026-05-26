import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { Lightbox } from '@/features/images/components/Lightbox';
import type { Image } from '@/features/images/types/image';

const images: Image[] = [
  { id: 1, title: 'Beach', s3_key: 'k1', album_id: 1, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1' },
  { id: 2, title: 'Mountain', s3_key: 'k2', album_id: 1, created_at: '2026-06-15T00:00:00.000Z', url: 'https://url2' },
  { id: 3, title: 'Forest', s3_key: 'k3', album_id: 1, created_at: '2026-03-20T00:00:00.000Z', url: 'https://url3' },
];

function renderLightbox(initialIndex = 0, onClose = vi.fn()) {
  return render(
    <Lightbox images={images} initialIndex={initialIndex} onClose={onClose}>
      <Lightbox.Overlay />
      <Lightbox.Image />
      <Lightbox.Meta />
      <Lightbox.Nav />
      <Lightbox.Close />
    </Lightbox>
  );
}

describe('Lightbox', () => {
  it('renders the initial image', () => {
    renderLightbox(0);
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url1');
  });

  it('shows the image title and upload date', () => {
    renderLightbox(0);
    const meta = screen.getByTestId('lightbox-meta');
    expect(meta).toHaveTextContent('Beach');
    expect(meta).toHaveTextContent('Jan 1, 2026');
  });

  it('calls onClose when the overlay is clicked', async () => {
    const onClose = vi.fn();
    renderLightbox(0, onClose);
    await userEvent.click(screen.getByTestId('lightbox-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    renderLightbox(0, onClose);
    await userEvent.click(screen.getByTestId('lightbox-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('navigates to the next image', async () => {
    renderLightbox(0);
    await userEvent.click(screen.getByTestId('lightbox-next'));
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url2');
  });

  it('navigates to the previous image', async () => {
    renderLightbox(1);
    await userEvent.click(screen.getByTestId('lightbox-prev'));
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url1');
  });

  it('disables Prev on the first image', () => {
    renderLightbox(0);
    expect(screen.getByTestId('lightbox-prev')).toBeDisabled();
  });

  it('disables Next on the last image', () => {
    renderLightbox(2);
    expect(screen.getByTestId('lightbox-next')).toBeDisabled();
  });

  it('closes on Escape key', async () => {
    const onClose = vi.fn();
    renderLightbox(0, onClose);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('navigates with arrow keys', async () => {
    renderLightbox(0);
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url2');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('lightbox-image')).toHaveAttribute('src', 'https://url1');
  });
});
