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
  parent_id: null,
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

// The Location picker pages through GET /api/v1/albums and names the current parent with
// GET /api/v1/albums/:id.
function stubFolders(folders: Album[] = []) {
  mock.onGet('/albums').reply(200, {
    data: folders.map(attributes => ({ attributes })),
    meta: { current_page: 1, total_pages: 1, total_count: folders.length, per_page: 25 },
  });
  mock.onGet(/^\/albums\/\d+$/).reply(config => {
    const found = folders.find(f => f.id === Number(config.url!.split('/').pop()));
    return found ? [ 200, { data: { attributes: found } } ] : [ 404, { errors: 'Not found' } ];
  });
}

const folder = (id: number, name: string): Album => ({
  id, name, description: null, parent_id: null, created_at: '2026-01-01T00:00:00.000Z',
});

function patchBody() {
  return JSON.parse(mock.history.patch[0].data).album ?? JSON.parse(mock.history.patch[0].data);
}

describe('AlbumEditModal', () => {
  beforeEach(() => {
    mock.reset();
    stubFolders();
  });

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
    mock.onPatch('/albums/1').reply(200, { data: { attributes: updated } });

    const onClose = vi.fn();
    renderModal(onClose);

    await userEvent.clear(screen.getByTestId('edit-name-input'));
    await userEvent.type(screen.getByTestId('edit-name-input'), 'New Name');
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mock.history.patch[0].url).toBe('/albums/1');
  });

  it('shows an error message when save fails', async () => {
    mock.onPatch('/albums/1').reply(500);

    renderModal();
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('album-edit-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('album-edit-modal')).toBeInTheDocument();
  });

  describe('Location', () => {
    const destination = folder(9, 'Trips');

    it('names the folder it is already in', async () => {
      stubFolders([ destination ]);
      render(<AlbumEditModal album={{ ...album, parent_id: 9 }} onClose={vi.fn()} />, {
        wrapper: makeWrapper(),
      });

      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Location' })).toHaveValue('Trips')
      );
    });

    it('says Top level for a folder that is in none', () => {
      renderModal();
      expect(screen.getByRole('combobox', { name: 'Location' })).toHaveValue('Top level');
    });

    it('moves the folder when a new one is picked', async () => {
      stubFolders([ destination ]);
      mock.onPatch('/albums/1').reply(200, { data: { attributes: album } });
      renderModal();

      await userEvent.click(screen.getAllByTestId('album-picker-toggle')[0]);
      await waitFor(() => expect(screen.getByTestId('album-picker-option-9')).toBeInTheDocument());
      await userEvent.click(screen.getByTestId('album-picker-option-9'));
      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() => expect(mock.history.patch).toHaveLength(1));
      expect(patchBody().parent_id).toBe(9);
    });

    it('moves the folder out to the top level', async () => {
      stubFolders([ destination ]);
      mock.onPatch('/albums/1').reply(200, { data: { attributes: album } });
      render(<AlbumEditModal album={{ ...album, parent_id: 9 }} onClose={vi.fn()} />, {
        wrapper: makeWrapper(),
      });

      await userEvent.click(screen.getAllByTestId('album-picker-toggle')[0]);
      await userEvent.click(await screen.findByTestId('album-picker-top-level'));
      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() => expect(mock.history.patch).toHaveLength(1));
      expect(patchBody().parent_id).toBeNull();
    });

    // An omitted parent_id leaves the folder where it is, so a rename never races a move
    // it did not ask for.
    it('says nothing about the location when only the name changed', async () => {
      mock.onPatch('/albums/1').reply(200, { data: { attributes: album } });
      renderModal();

      await userEvent.clear(screen.getByTestId('edit-name-input'));
      await userEvent.type(screen.getByTestId('edit-name-input'), 'Renamed');
      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() => expect(mock.history.patch).toHaveLength(1));
      expect(patchBody()).not.toHaveProperty('parent_id');
    });

    // The picker cannot offer a folder inside the one being moved, but the server is the
    // one that decides, and it says why.
    it('shows the reason the server gave for refusing a move', async () => {
      mock.onPatch('/albums/1').reply(422, {
        errors: 'cannot be the folder itself or one of its subfolders',
      });
      renderModal();

      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() =>
        expect(screen.getByTestId('album-edit-error'))
          .toHaveTextContent('cannot be the folder itself or one of its subfolders')
      );
    });

    it('falls back to a fixed sentence when the failure explains nothing', async () => {
      mock.onPatch('/albums/1').reply(500);
      renderModal();

      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() =>
        expect(screen.getByTestId('album-edit-error')).toHaveTextContent('Failed to save')
      );
    });
  });
});
