import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '@/lib/api/client';
import { ImageEditModal } from '@/features/images/components/ImageEditModal';
import type { Image } from '@/features/images/types/image';

const mock = new MockAdapter(apiClient);
afterAll(() => mock.restore());

const image: Image = {
  id: 1,
  title: 'Beach',
  description: 'A sunny beach',
  tags: ['sea', 'sun'],
  s3_key: 'k1',
  album_id: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://url1',
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderModal(onClose = vi.fn()) {
  return render(<ImageEditModal image={image} onClose={onClose} />, {
    wrapper: makeWrapper(),
  });
}

describe('ImageEditModal', () => {
  beforeEach(() => mock.reset());

  it('renders the modal', () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    renderModal();
    expect(screen.getByTestId('image-edit-modal')).toBeInTheDocument();
  });

  it('pre-populates the title field', () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    renderModal();
    expect(screen.getByTestId('edit-title-input')).toHaveValue('Beach');
  });

  it('pre-populates the description field', () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    renderModal();
    expect(screen.getByTestId('edit-description-input')).toHaveValue('A sunny beach');
  });

  it('pre-populates the tags field as comma-separated text', () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    renderModal();
    expect(screen.getByTestId('edit-tags-input')).toHaveValue('sea, sun');
  });

  it('calls onClose when the cancel button is clicked', async () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the overlay is clicked', async () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByTestId('image-edit-modal-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a validation error when the title is cleared', async () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    renderModal();
    await userEvent.clear(screen.getByTestId('edit-title-input'));
    await userEvent.click(screen.getByTestId('edit-save-button'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-title-error')).toBeInTheDocument();
    });
    expect(mock.history.patch).toHaveLength(0);
  });

  it('calls PATCH and then onClose on successful save', async () => {
    const updated: Image = { ...image, title: 'New Beach' };
    mock.onGet('/api/albums').reply(200, { data: [] });
    mock.onPatch('/api/images/1').reply(200, { data: { attributes: updated } });

    const onClose = vi.fn();
    renderModal(onClose);

    await userEvent.clear(screen.getByTestId('edit-title-input'));
    await userEvent.type(screen.getByTestId('edit-title-input'), 'New Beach');
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mock.history.patch[0].url).toBe('/api/images/1');
  });

  it('shows an error message when save fails', async () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    mock.onPatch('/api/images/1').reply(500);

    renderModal();
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('image-edit-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('image-edit-modal')).toBeInTheDocument();
  });

  it('populates the album select with available albums', async () => {
    mock.onGet('/api/albums').reply(200, {
      data: [
        { attributes: { id: 1, name: 'Holidays', description: null, created_at: '2026-01-01T00:00:00.000Z' } },
        { attributes: { id: 2, name: 'Family', description: null, created_at: '2026-01-01T00:00:00.000Z' } },
      ],
    });
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Holidays' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Family' })).toBeInTheDocument();
    });
  });

  it('starts in delete-confirmation view when initialMode is delete', () => {
    mock.onGet('/api/albums').reply(200, { data: [] });
    render(<ImageEditModal image={image} onClose={vi.fn()} initialMode="delete" />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByTestId('delete-confirm-button')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-save-button')).not.toBeInTheDocument();
  });

  describe('delete flow', () => {
    it('renders a delete button', () => {
      mock.onGet('/api/albums').reply(200, { data: [] });
      renderModal();
      expect(screen.getByTestId('delete-image-button')).toBeInTheDocument();
    });

    it('shows the confirmation view when the delete button is clicked', async () => {
      mock.onGet('/api/albums').reply(200, { data: [] });
      renderModal();
      await userEvent.click(screen.getByTestId('delete-image-button'));
      expect(screen.getByTestId('delete-confirm-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-cancel-button')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-save-button')).not.toBeInTheDocument();
    });

    it('returns to the edit view when cancel is clicked after opening delete from edit form', async () => {
      mock.onGet('/api/albums').reply(200, { data: [] });
      renderModal();
      await userEvent.click(screen.getByTestId('delete-image-button'));
      await userEvent.click(screen.getByTestId('delete-cancel-button'));
      expect(screen.getByTestId('edit-save-button')).toBeInTheDocument();
      expect(screen.queryByTestId('delete-confirm-button')).not.toBeInTheDocument();
    });

    it('calls onClose when cancel is clicked in confirmation opened via initialMode=delete', async () => {
      mock.onGet('/api/albums').reply(200, { data: [] });
      const onClose = vi.fn();
      render(<ImageEditModal image={image} onClose={onClose} initialMode="delete" />, {
        wrapper: makeWrapper(),
      });
      await userEvent.click(screen.getByTestId('delete-cancel-button'));
      expect(onClose).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('edit-save-button')).not.toBeInTheDocument();
    });

    it('calls DELETE and then onClose on confirmation', async () => {
      mock.onGet('/api/albums').reply(200, { data: [] });
      mock.onDelete('/api/images/1').reply(204);

      const onClose = vi.fn();
      renderModal(onClose);

      await userEvent.click(screen.getByTestId('delete-image-button'));
      await userEvent.click(screen.getByTestId('delete-confirm-button'));

      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(mock.history.delete[0].url).toBe('/api/images/1');
    });

    it('shows an error message when delete fails', async () => {
      mock.onGet('/api/albums').reply(200, { data: [] });
      mock.onDelete('/api/images/1').reply(500);

      renderModal();
      await userEvent.click(screen.getByTestId('delete-image-button'));
      await userEvent.click(screen.getByTestId('delete-confirm-button'));

      await waitFor(() => {
        expect(screen.getByTestId('delete-image-error')).toBeInTheDocument();
      });
    });
  });
});
