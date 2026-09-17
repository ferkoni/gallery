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

const folder = (id: number, name: string, ancestors: { id: number; name: string }[] = []): Album => ({
  id, name, description: null, parent_id: ancestors.at(-1)?.id ?? null,
  created_at: '2026-01-01T00:00:00.000Z', ancestors,
});

// Holidays and Trips at the top; Beach inside Holidays; Day 2 inside Trips › Madrid.
const HOLIDAYS = folder(1, 'Holidays');
const TRIPS = folder(2, 'Trips');
const BEACH = folder(3, 'Beach', [ { id: 1, name: 'Holidays' } ]);
const MADRID = folder(4, 'Madrid', [ { id: 2, name: 'Trips' } ]);
const DAY_2 = folder(5, 'Day 2', [ { id: 2, name: 'Trips' }, { id: 4, name: 'Madrid' } ]);
const FOLDERS = [ HOLIDAYS, TRIPS, BEACH, MADRID, DAY_2 ];

// The picker pages through GET /api/v1/albums one level at a time (parent_id), and the
// dialog and picker resolve folders by id, as in ImageEditModal's tests.
function stubFolders(albums = FOLDERS) {
  mock.onGet('/albums').reply(config => {
    const parentId = config.params?.parent_id ?? null;
    const level = albums.filter(a => a.parent_id === (parentId === null ? null : Number(parentId)));
    return [200, {
      data: level.map(attributes => ({ attributes })),
      meta: { current_page: 1, total_pages: 1, total_count: level.length, per_page: 25 },
    }];
  });
  mock.onGet(/^\/albums\/\d+$/).reply(config => {
    const found = albums.find(a => a.id === Number(config.url!.split('/').pop()));
    return found ? [200, { data: { attributes: found } }] : [404, { errors: 'Not found' }];
  });
}

const levelsAsked = () =>
  mock.history.get.filter(r => r.url === '/albums').map(r => r.params?.parent_id ?? null);

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

// Opens the picker, which only appears once the current folder has loaded, and picks a
// folder at the level it opens on.
async function choose(name: string) {
  await userEvent.click(await screen.findByTestId('album-picker-toggle'));
  await userEvent.click(await screen.findByText(name));
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
    renderModal({ from: 1 });

    // Inside Holidays, so its own row is one level up.
    await userEvent.click(await screen.findByTestId('album-picker-toggle'));
    await userEvent.click(await screen.findByTestId('album-picker-crumb-root'));
    await userEvent.click(await screen.findByText('Holidays'));

    expect(screen.getByTestId('move-same-folder')).toBeInTheDocument();
    expect(screen.getByTestId('move-confirm-button')).toBeDisabled();
  });

  it('sends the move and closes on success', async () => {
    mock.onPatch('/images/move').reply(204);
    const { onClose } = renderModal({ ids: [7, 8], from: 1 });

    await choose('Beach');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ ids: [7, 8], album_id: 3 });
  });

  it('records the target folder name for the toast', async () => {
    mock.onPatch('/images/move').reply(204);
    renderModal({ ids: [7], from: 1 });

    await choose('Beach');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() =>
      expect(useSelectionStore.getState().lastMove).toEqual({ ids: [7], from: 1, to: { id: 3, name: 'Beach' } })
    );
  });

  it("shows the API's sentence on a 404 and stays open", async () => {
    mock.onPatch('/images/move').reply(404, { errors: 'Not found' });
    const { onClose } = renderModal();

    await choose('Beach');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() => expect(screen.getByTestId('move-images-error')).toHaveTextContent('Not found'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('move-images-modal')).toBeInTheDocument();
  });

  it('falls back to its own sentence when the failure carries none', async () => {
    mock.onPatch('/images/move').networkError();
    renderModal();

    await choose('Beach');
    await userEvent.click(screen.getByTestId('move-confirm-button'));

    await waitFor(() =>
      expect(screen.getByTestId('move-images-error')).toHaveTextContent("Couldn't move the photos. Try again.")
    );
  });

  it('says it is moving while the request is in flight, and refuses a second click', async () => {
    mock.onPatch('/images/move').reply(() => new Promise(() => {}));
    renderModal();

    await choose('Beach');
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

  describe('where the folder list opens', () => {
    it('inside the folder the photos are in, showing its subfolders', async () => {
      renderModal({ from: 1 });

      await userEvent.click(await screen.findByTestId('album-picker-toggle'));

      expect(await screen.findByText('Beach')).toBeInTheDocument();
      expect(screen.queryByText('Trips')).not.toBeInTheDocument();
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Holidays');
      expect(levelsAsked()).toEqual([1]);
    });

    it('with the whole path to a nested folder, so each level above is a click away', async () => {
      renderModal({ from: 5 });

      await userEvent.click(await screen.findByTestId('album-picker-toggle'));

      expect(screen.getByTestId('album-picker-path')).toHaveAttribute('title', 'Folders › Trips › Madrid › Day 2');
      await userEvent.click(screen.getByTestId('album-picker-crumb-4'));
      expect(await screen.findByText('Day 2')).toBeInTheDocument();
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Trips › Madrid');
    });

    it('back at the top in one click, for a folder elsewhere', async () => {
      mock.onPatch('/images/move').reply(204);
      renderModal({ ids: [7], from: 5 });

      await userEvent.click(await screen.findByTestId('album-picker-toggle'));
      await userEvent.click(screen.getByTestId('album-picker-crumb-root'));
      await userEvent.click(await screen.findByText('Holidays'));
      await userEvent.click(screen.getByTestId('move-confirm-button'));

      await waitFor(() => expect(mock.history.patch).toHaveLength(1));
      expect(JSON.parse(mock.history.patch[0].data)).toEqual({ ids: [7], album_id: 1 });
    });

    it('says it is loading until it knows the current folder', () => {
      mock.onGet(/^\/albums\/\d+$/).reply(() => new Promise(() => {}));
      renderModal({ from: 1 });

      expect(screen.getByTestId('move-images-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('album-picker-toggle')).not.toBeInTheDocument();
    });

    it('at the top, as before, when the current folder cannot be loaded', async () => {
      renderModal({ from: 99 });

      await userEvent.click(await screen.findByTestId('album-picker-toggle'));

      expect(await screen.findByText('Holidays')).toBeInTheDocument();
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders');
    });
  });

  it('closes from Cancel and from the overlay', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByTestId('move-cancel-button'));
    await userEvent.click(screen.getByTestId('move-images-modal-overlay'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
