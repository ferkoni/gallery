import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '@/lib/api/client';
import { MoveImagesModal } from '@/features/images/components/MoveImagesModal';
import { useSelectionStore } from '@/features/images/store/selectionStore';
import type { Album } from '@/features/albums/types/album';

const mock = new MockAdapter(apiClient);
afterAll(() => mock.restore());

const folder = (id: number, name: string): Album => ({
  id, name, description: null, parent_id: null, created_at: '2026-01-01T00:00:00.000Z',
});

const FOLDERS = [folder(1, 'Holidays'), folder(2, 'Trips')];

// The picker pages through GET /api/v1/albums and resolves a chosen folder by id, as in
// ImageEditModal's tests.
function stubFolders(albums = FOLDERS) {
  mock.onGet('/albums').reply(200, {
    data: albums.map(attributes => ({ attributes })),
    meta: { current_page: 1, total_pages: 1, total_count: albums.length, per_page: 25 },
  });
  mock.onGet(/^\/albums\/\d+$/).reply(config => {
    const found = albums.find(a => a.id === Number(config.url!.split('/').pop()));
    return found ? [200, { data: { attributes: found } }] : [404, { errors: 'Not found' }];
  });
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderModal({ ids = [1, 2], from = 1, onClose = vi.fn() } = {}) {
  render(<MoveImagesModal ids={ids} from={from} onClose={onClose} />, { wrapper: makeWrapper() });
  return { onClose };
}

async function choose(name: string) {
  await userEvent.click(screen.getByTestId('album-picker-toggle'));
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
  await userEvent.click(screen.getByText(name));
}

describe('MoveImagesModal', () => {
  beforeEach(() => {
    mock.reset();
    useSelectionStore.getState().reset();
    stubFolders();
  });

  it('counts the photos in the heading, pluralised', () => {
    renderModal();
    expect(screen.getByRole('heading')).toHaveTextContent('Move 2 photos');
  });

  it('says "1 photo" for one', () => {
    renderModal({ ids: [1] });
    expect(screen.getByRole('heading')).toHaveTextContent('Move 1 photo');
  });

  it('disables Move until a folder is chosen', () => {
    renderModal();
    expect(screen.getByTestId('move-confirm-button')).toBeDisabled();
  });

  it('refuses the folder the photos are already in', async () => {
    renderModal({ from: 2 });

    await choose('Trips');

    expect(screen.getByTestId('move-same-folder')).toBeInTheDocument();
    expect(screen.getByTestId('move-confirm-button')).toBeDisabled();
  });

  it('sends the move and closes on success', async () => {
    mock.onPatch('/images/move').reply(204);
    const { onClose } = renderModal({ ids: [7, 8], from: 1 });

    await choose('Trips');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ ids: [7, 8], album_id: 2 });
  });

  it('records the target folder name for the toast', async () => {
    mock.onPatch('/images/move').reply(204);
    renderModal({ ids: [7], from: 1 });

    await choose('Trips');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() =>
      expect(useSelectionStore.getState().lastMove).toEqual({ ids: [7], from: 1, to: { id: 2, name: 'Trips' } })
    );
  });

  it("shows the API's sentence on a 404 and stays open", async () => {
    mock.onPatch('/images/move').reply(404, { errors: 'Not found' });
    const { onClose } = renderModal();

    await choose('Trips');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() => expect(screen.getByTestId('move-images-error')).toHaveTextContent('Not found'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('move-images-modal')).toBeInTheDocument();
  });

  it('falls back to its own sentence when the failure carries none', async () => {
    mock.onPatch('/images/move').networkError();
    renderModal();

    await choose('Trips');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() =>
      expect(screen.getByTestId('move-images-error')).toHaveTextContent("Couldn't move the photos. Try again.")
    );
  });

  it('says it is moving while the request is in flight, and refuses a second click', async () => {
    mock.onPatch('/images/move').reply(() => new Promise(() => {}));
    renderModal();

    await choose('Trips');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() => expect(screen.getByTestId('move-confirm-button')).toHaveTextContent('Moving…'));
    expect(screen.getByTestId('move-confirm-button')).toBeDisabled();
  });

  // The button is disabled, so this only fires if something dispatches the event anyway. The
  // guard is what keeps a move with no destination from reaching the API.
  it('sends nothing when no folder has been chosen', async () => {
    mock.onPatch('/images/move').reply(204);
    renderModal();

    fireEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() => expect(mock.history.patch).toHaveLength(0));
  });

  it('closes from Cancel and from the overlay', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByTestId('move-cancel-button'));
    await userEvent.click(screen.getByTestId('move-images-modal-overlay'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
