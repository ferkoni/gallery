import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '@/lib/api/client';
import { AlbumEditModal } from '@/features/albums/components/AlbumEditModal';
import type { Album } from '@/features/albums/types/album';

const mock = new MockAdapter(apiClient);
afterAll(() => mock.restore());

const album: Album = {
  id: 1,
  name: 'My Album',
  description: 'A description',
  created_at: '2026-01-01T00:00:00.000Z',
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
  return render(<AlbumEditModal album={album} onClose={onClose} />, {
    wrapper: makeWrapper(),
  });
}

describe('AlbumEditModal', () => {
  beforeEach(() => mock.reset());

  it('renders the modal', () => {
    renderModal();
    expect(screen.getByTestId('album-edit-modal')).toBeInTheDocument();
  });

  it('pre-populates the name field', () => {
    renderModal();
    expect(screen.getByTestId('edit-name-input')).toHaveValue('My Album');
  });

  it('pre-populates the description field', () => {
    renderModal();
    expect(screen.getByTestId('edit-description-input')).toHaveValue('A description');
  });

  it('falls back to empty string when description is null', () => {
    const nullDescAlbum = { ...album, description: null };
    render(<AlbumEditModal album={nullDescAlbum} onClose={vi.fn()} />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('edit-description-input')).toHaveValue('');
  });

  it('calls onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the overlay is clicked', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByTestId('album-edit-modal-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a validation error when the name is cleared', async () => {
    renderModal();
    await userEvent.clear(screen.getByTestId('edit-name-input'));
    await userEvent.click(screen.getByTestId('edit-save-button'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-name-error')).toBeInTheDocument();
    });
    expect(mock.history.patch).toHaveLength(0);
  });

  it('calls PATCH and then onClose on successful save', async () => {
    const updated: Album = { ...album, name: 'New Name' };
    mock.onPatch('/api/albums/1').reply(200, { data: { attributes: updated } });

    const onClose = vi.fn();
    renderModal(onClose);

    await userEvent.clear(screen.getByTestId('edit-name-input'));
    await userEvent.type(screen.getByTestId('edit-name-input'), 'New Name');
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mock.history.patch[0].url).toBe('/api/albums/1');
  });

  it('shows an error message when save fails', async () => {
    mock.onPatch('/api/albums/1').reply(500);

    renderModal();
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('album-edit-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('album-edit-modal')).toBeInTheDocument();
  });
});
