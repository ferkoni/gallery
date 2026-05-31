import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { Lightbox } from '@/features/images/components/Lightbox';
import type { Image } from '@/features/images/types/image';

const images: Image[] = [
  {
    id: 1,
    title: 'Beach',
    description: 'A sunny beach',
    tags: ['sea', 'sun'],
    s3_key: 'k1',
    album_id: 1,
    favorited: false,
    created_at: '2026-01-01T00:00:00.000Z',
    url: 'https://url1',
  },
  {
    id: 2,
    title: 'Mountain',
    description: null,
    tags: [],
    s3_key: 'k2',
    album_id: 1,
    favorited: false,
    created_at: '2026-06-15T00:00:00.000Z',
    url: 'https://url2',
  },
  {
    id: 3,
    title: 'Forest',
    description: null,
    tags: [],
    s3_key: 'k3',
    album_id: 1,
    favorited: false,
    created_at: '2026-03-20T00:00:00.000Z',
    url: 'https://url3',
  },
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

function renderLightboxWithMenu(
  initialIndex = 0,
  onClose = vi.fn(),
  onEdit = vi.fn(),
  onDelete = vi.fn()
) {
  return render(
    <Lightbox images={images} initialIndex={initialIndex} onClose={onClose}>
      <Lightbox.Overlay />
      <Lightbox.Image />
      <Lightbox.Meta />
      <Lightbox.Nav />
      <Lightbox.Close />
      <Lightbox.Menu onEdit={onEdit} onDelete={onDelete} />
    </Lightbox>
  );
}

afterEach(() => {
  document.body.style.overflow = '';
});

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

  it('shows description when present', () => {
    renderLightbox(0);
    expect(screen.getByTestId('lightbox-meta')).toHaveTextContent('A sunny beach');
  });

  it('shows tags when present', () => {
    renderLightbox(0);
    expect(screen.getByTestId('lightbox-meta')).toHaveTextContent('sea, sun');
  });

  it('does not show description or tags for images without them', () => {
    renderLightbox(1);
    const meta = screen.getByTestId('lightbox-meta');
    expect(meta).toHaveTextContent('Mountain');
    expect(meta).not.toHaveTextContent('A sunny beach');
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

  it('sets body overflow to hidden while open', () => {
    renderLightbox(0);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body overflow when unmounted', () => {
    const { unmount } = renderLightbox(0);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });


});

describe('Lightbox.Menu', () => {
  it('renders the three-dots menu button', () => {
    renderLightboxWithMenu();
    expect(screen.getByTestId('lightbox-menu-button')).toBeInTheDocument();
  });

  it('opens the dropdown when the menu button is clicked', async () => {
    renderLightboxWithMenu();
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    expect(screen.getByTestId('lightbox-menu-dropdown')).toBeInTheDocument();
  });

  it('closes the dropdown when the menu button is clicked again', async () => {
    renderLightboxWithMenu();
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    expect(screen.queryByTestId('lightbox-menu-dropdown')).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside', async () => {
    renderLightboxWithMenu();
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('lightbox-menu-dropdown')).not.toBeInTheDocument();
  });

  it('calls onEdit with the current image and closes the dropdown', async () => {
    const onEdit = vi.fn();
    renderLightboxWithMenu(0, vi.fn(), onEdit);
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-edit'));
    expect(onEdit).toHaveBeenCalledWith(images[0]);
    expect(screen.queryByTestId('lightbox-menu-dropdown')).not.toBeInTheDocument();
  });

  it('calls onDelete with the current image and closes the dropdown', async () => {
    const onDelete = vi.fn();
    renderLightboxWithMenu(0, vi.fn(), vi.fn(), onDelete);
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-delete'));
    expect(onDelete).toHaveBeenCalledWith(images[0]);
    expect(screen.queryByTestId('lightbox-menu-dropdown')).not.toBeInTheDocument();
  });

  it('passes the current image after navigation', async () => {
    const onEdit = vi.fn();
    renderLightboxWithMenu(0, vi.fn(), onEdit);
    await userEvent.click(screen.getByTestId('lightbox-next'));
    await userEvent.click(screen.getByTestId('lightbox-menu-button'));
    await userEvent.click(screen.getByTestId('lightbox-menu-edit'));
    expect(onEdit).toHaveBeenCalledWith(images[1]);
  });
});
