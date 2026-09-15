import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '@/lib/api/client';
import { ImageEditModal } from '@/features/images/components/ImageEditModal';
import type { Image } from '@/features/images/types/image';
import type { Album } from '@/features/albums/types/album';

const mock = new MockAdapter(apiClient);
afterAll(() => mock.restore());

const image: Image = {
  id: 1,
  title: 'Beach',
  description: 'A sunny beach',
  tags: ['sea', 'sun'],
  s3_key: 'k1',
  album_id: 1,
  favorited: false,
  created_at: '2026-01-01T00:00:00.000Z',
  url: 'https://url1',
  thumbnail_url: 'https://thumb1',
};

const folder = (id: number, name: string): Album => ({
  id, name, description: null, parent_id: null, created_at: '2026-01-01T00:00:00.000Z',
});

// The folder picker pages through GET /api/albums and resolves the photo's own folder
// with GET /api/albums/:id. `pages` is what the server has, one array per page; `known`
// is what the by-id lookup can answer, which is every folder unless a test says otherwise.
function stubFolders(pages: Album[][] = [[folder(1, 'Holidays')]], known = pages.flat()) {
  mock.onGet('/api/albums').reply(config => {
    const page = Number(config.params?.page ?? 1);
    const q = config.params?.q as string | undefined;
    // ?q= searches every folder, as the server does; without it, one page at a time.
    const available = q
      ? [pages.flat().filter(a => a.name.toLowerCase().includes(q.toLowerCase()))]
      : pages;
    const data = available[page - 1] ?? [];
    return [200, {
      data: data.map(attributes => ({ attributes })),
      meta: { current_page: page, total_pages: available.length, total_count: available.flat().length, per_page: 25 },
    }];
  });

  mock.onGet(/^\/api\/albums\/\d+$/).reply(config => {
    const found = known.find(a => a.id === Number(config.url!.split('/').pop()));
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

function renderModal(onClose = vi.fn()) {
  return render(<ImageEditModal image={image} onClose={onClose} />, {
    wrapper: makeWrapper(),
  });
}

describe('ImageEditModal', () => {
  beforeEach(() => mock.reset());

  it('renders the modal', () => {
    stubFolders();
    renderModal();
    expect(screen.getByTestId('image-edit-modal')).toBeInTheDocument();
  });

  it('pre-populates the title field', () => {
    stubFolders();
    renderModal();
    expect(screen.getByTestId('edit-title-input')).toHaveValue('Beach');
  });

  it('pre-populates the description field', () => {
    stubFolders();
    renderModal();
    expect(screen.getByTestId('edit-description-input')).toHaveValue('A sunny beach');
  });

  it('pre-populates the tags field as comma-separated text', () => {
    stubFolders();
    renderModal();
    expect(screen.getByTestId('edit-tags-input')).toHaveValue('sea, sun');
  });

  it('calls onClose when the cancel button is clicked', async () => {
    stubFolders();
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the overlay is clicked', async () => {
    stubFolders();
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByTestId('image-edit-modal-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a validation error when the title is cleared', async () => {
    stubFolders();
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
    stubFolders();
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
    stubFolders();
    mock.onPatch('/api/images/1').reply(500);

    renderModal();
    await userEvent.click(screen.getByTestId('edit-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('image-edit-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('image-edit-modal')).toBeInTheDocument();
  });

  it('lists the folders the server returned', async () => {
    stubFolders([[folder(1, 'Holidays'), folder(2, 'Family')]]);
    renderModal();

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('album-picker-option-1')).toHaveTextContent('Holidays');
      expect(screen.getByTestId('album-picker-option-2')).toHaveTextContent('Family');
    });
  });

  // Regressions from the truncated <select> this picker replaced. Each stubs a first page
  // that does not contain the folder in question.
  describe('folders outside the first page', () => {
    it('can move a photo into a folder that is not on the first page', async () => {
      const distant = folder(40, 'Archive 2019');
      stubFolders([[folder(1, 'Holidays')], [distant]]);
      mock.onPatch('/api/images/1').reply(200, { data: { attributes: image } });

      renderModal();

      // Typing filters server-side, so a folder the first page never contained is reachable.
      await userEvent.type(screen.getByTestId('album-picker-input'), 'Archive');
      await waitFor(() => expect(screen.getByTestId('album-picker-option-40')).toBeInTheDocument());
      await userEvent.click(screen.getByTestId('album-picker-option-40'));
      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() => expect(mock.history.patch).toHaveLength(1));
      expect(JSON.parse(mock.history.patch[0].data).image.album_id).toBe(40);
    });

    it("names the photo's own folder, and leaves it alone on a title-only save", async () => {
      const distant = folder(40, 'Archive 2019');
      stubFolders([[folder(1, 'Holidays')]], [folder(1, 'Holidays'), distant]);
      mock.onPatch('/api/images/40').reply(200, { data: { attributes: image } });

      render(<ImageEditModal image={{ ...image, id: 40, album_id: 40 }} onClose={vi.fn()} />, {
        wrapper: makeWrapper(),
      });

      // The old <select> displayed "Holidays" here — the first option of the loaded page.
      await waitFor(() =>
        expect(screen.getByTestId('album-picker-input')).toHaveValue('Archive 2019')
      );

      await userEvent.clear(screen.getByTestId('edit-title-input'));
      await userEvent.type(screen.getByTestId('edit-title-input'), 'New title');
      await userEvent.click(screen.getByTestId('edit-save-button'));

      await waitFor(() => expect(mock.history.patch).toHaveLength(1));
      expect(JSON.parse(mock.history.patch[0].data).image.album_id).toBe(40);
    });
  });

  it('starts in delete-confirmation view when initialMode is delete', () => {
    stubFolders();
    render(<ImageEditModal image={image} onClose={vi.fn()} initialMode="delete" />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByTestId('delete-confirm-button')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-save-button')).not.toBeInTheDocument();
  });

  describe('delete flow', () => {
    it('renders a delete button', () => {
      stubFolders();
      renderModal();
      expect(screen.getByTestId('delete-image-button')).toBeInTheDocument();
    });

    it('shows the confirmation view when the delete button is clicked', async () => {
      stubFolders();
      renderModal();
      await userEvent.click(screen.getByTestId('delete-image-button'));
      expect(screen.getByTestId('delete-confirm-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-cancel-button')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-save-button')).not.toBeInTheDocument();
    });

    it('returns to the edit view when cancel is clicked after opening delete from edit form', async () => {
      stubFolders();
      renderModal();
      await userEvent.click(screen.getByTestId('delete-image-button'));
      await userEvent.click(screen.getByTestId('delete-cancel-button'));
      expect(screen.getByTestId('edit-save-button')).toBeInTheDocument();
      expect(screen.queryByTestId('delete-confirm-button')).not.toBeInTheDocument();
    });

    it('calls onClose when cancel is clicked in confirmation opened via initialMode=delete', async () => {
      stubFolders();
      const onClose = vi.fn();
      render(<ImageEditModal image={image} onClose={onClose} initialMode="delete" />, {
        wrapper: makeWrapper(),
      });
      await userEvent.click(screen.getByTestId('delete-cancel-button'));
      expect(onClose).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('edit-save-button')).not.toBeInTheDocument();
    });

    it('calls DELETE and then onClose on confirmation', async () => {
      stubFolders();
      mock.onDelete('/api/images/1').reply(204);

      const onClose = vi.fn();
      renderModal(onClose);

      await userEvent.click(screen.getByTestId('delete-image-button'));
      await userEvent.click(screen.getByTestId('delete-confirm-button'));

      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(mock.history.delete[0].url).toBe('/api/images/1');
    });

    it('shows an error message when delete fails', async () => {
      stubFolders();
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
