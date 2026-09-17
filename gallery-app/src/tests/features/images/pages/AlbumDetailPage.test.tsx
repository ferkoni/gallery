import { render, screen, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlbumDetailPage } from '@/features/images/pages/AlbumDetailPage';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import { useAlbumImageCount } from '@/features/images/hooks/useImages';
import { useSelectionStore } from '@/features/images/store/selectionStore';
import type { Album } from '@/features/albums/types/album';

const { mockMove } = vi.hoisted(() => ({ mockMove: vi.fn() }));

vi.mock('@/features/albums/albums', () => ({
  useGetAlbum: vi.fn(),
  useInfiniteAlbums: vi.fn(),
  useUpdateAlbum: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
}));
vi.mock('@/features/images/hooks/useImages', () => ({
  useAlbumImageCount: vi.fn(),
  useMoveImages: vi.fn(() => ({ mutate: mockMove })),
}));
// The photo grid has its own tests; here it only needs to be findable, to check that the
// subfolders come before it.
vi.mock('@/features/images/components/ImageGrid', () => ({
  ImageGrid: () => <div data-testid="image-grid" />,
}));
vi.mock('@/features/downloads/components/DownloadAlbumButton', () => ({
  DownloadAlbumButton: ({ disabled }: { disabled?: boolean }) => (
    <button data-testid="download-button" disabled={disabled}>Download Folder</button>
  ),
}));

const mockUseGetAlbum = useGetAlbum as Mock;
const mockUseInfiniteAlbums = useInfiniteAlbums as Mock;
const mockUseAlbumImageCount = useAlbumImageCount as Mock;

const album: Album = {
  id: 1, name: 'Summer 2026', description: 'A great summer', parent_id: null, created_at: '2026-01-01',
};

const folder = (id: number, name: string): Album => ({
  id, name, description: null, parent_id: 1, created_at: '2026-01-01',
});

function stubSubfolders(albums: Album[], hasNextPage = false) {
  mockUseInfiniteAlbums.mockReturnValue({
    data: { pages: [{ data: albums, meta: {} }] },
    fetchNextPage: vi.fn(),
    hasNextPage,
    isFetchingNextPage: false,
    isPending: false,
    isPlaceholderData: false,
  });
}

function stubImageCount(total: number) {
  mockUseAlbumImageCount.mockReturnValue({ data: total });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/folders/1']}>
        <Routes>
          <Route path="/folders/:id" element={<AlbumDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AlbumDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSelectionStore.getState().reset();
    stubImageCount(0);
    stubSubfolders([]);
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: album });
  });

  it('renders loading state while album is fetching', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: true, isError: false, data: undefined });
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: true, data: undefined });
    renderPage();
    expect(screen.getByText('Failed to load folder.')).toBeInTheDocument();
  });

  it('renders album name and description', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Summer 2026' })).toBeInTheDocument();
    expect(screen.getByText('A great summer')).toBeInTheDocument();
  });

  it('does not render description when it is null', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: { ...album, description: null } });
    renderPage();
    expect(screen.queryByText('A great summer')).not.toBeInTheDocument();
  });

  it('renders the upload button', () => {
    renderPage();
    expect(screen.getByTestId('upload-button')).toBeInTheDocument();
  });

  it('links to creating a folder inside this one', () => {
    renderPage();
    expect(screen.getByTestId('new-subfolder-link')).toHaveAttribute('href', '/folders/new?parent=1');
  });

  describe('breadcrumbs', () => {
    it('shows the trail from the top, each level a link' , () => {
      mockUseGetAlbum.mockReturnValue({
        isPending: false, isError: false,
        data: { ...album, ancestors: [ { id: 8, name: 'Trips' }, { id: 9, name: 'Madrid' } ] },
      });
      renderPage();

      expect(screen.getByTestId('breadcrumb-8')).toHaveAttribute('href', '/folders/8');
      expect(screen.getByTestId('breadcrumb-9')).toHaveAttribute('href', '/folders/9');
      expect(screen.getByTestId('breadcrumb-current')).toHaveTextContent('Summer 2026');
    });

    it('shows only Folders and the name at the top level', () => {
      renderPage();

      expect(screen.getByTestId('album-breadcrumbs')).toHaveTextContent('Folders › Summer 2026');
    });

    // Folders may nest as deep as the user likes, so a long trail must not wrap across
    // the page.
    it('collapses the middle of a deep trail', () => {
      mockUseGetAlbum.mockReturnValue({
        isPending: false, isError: false,
        data: {
          ...album,
          ancestors: [
            { id: 1, name: 'One' }, { id: 2, name: 'Two' },
            { id: 3, name: 'Three' }, { id: 4, name: 'Four' },
          ],
        },
      });
      renderPage();

      expect(screen.getByTestId('breadcrumb-ellipsis')).toBeInTheDocument();
      expect(screen.getByTestId('breadcrumb-1')).toBeInTheDocument();
      expect(screen.getByTestId('breadcrumb-4')).toBeInTheDocument();
      expect(screen.queryByTestId('breadcrumb-2')).not.toBeInTheDocument();
    });
  });

  describe('subfolders', () => {
    it('lists them above the photos', () => {
      stubSubfolders([ folder(2, 'Madrid') ]);
      renderPage();

      const section = screen.getByTestId('subfolder-section');
      const grid = screen.getByTestId('image-grid');
      expect(section.compareDocumentPosition(grid)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByTestId('album-card-2')).toBeInTheDocument();
    });

    it('shows no section at all for a folder that has none', () => {
      renderPage();
      expect(screen.queryByTestId('subfolder-section')).not.toBeInTheDocument();
    });
  });

  describe('the download button', () => {
    it('is live for a folder with photos of its own', () => {
      stubImageCount(3);
      renderPage();
      expect(screen.getByTestId('download-button')).not.toBeDisabled();
    });

    // The zip is of the whole subtree, so a folder whose photos are all in subfolders is
    // downloadable. One whose subfolders are all empty still looks downloadable and is
    // not; that refusal is the server's, and it lands in the download queue.
    it('is live for a folder whose only contents are subfolders', () => {
      stubSubfolders([ folder(2, 'Madrid') ]);
      renderPage();
      expect(screen.getByTestId('download-button')).not.toBeDisabled();
    });

    it('is greyed out for a folder with neither photos nor subfolders', () => {
      renderPage();
      expect(screen.getByTestId('download-button')).toBeDisabled();
    });

    it('is not greyed out before both queries have answered', () => {
      mockUseAlbumImageCount.mockReturnValue({ data: undefined });
      renderPage();
      expect(screen.getByTestId('download-button')).not.toBeDisabled();
    });
  });

  describe('the undo toast', () => {
    const move = { ids: [1, 2], from: 1, to: { id: 2, name: 'Trips' } };
    const record = (over: Partial<typeof move> = {}) =>
      act(() => { useSelectionStore.getState().setLastMove({ ...move, ...over }); });

    it('shows nothing until a move has happened', () => {
      renderPage();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('names the count and the folder', () => {
      renderPage();
      record();
      expect(screen.getByRole('status')).toHaveTextContent('Moved 2 photos to Trips');
    });

    it('says "1 photo" for one', () => {
      renderPage();
      record({ ids: [1] });
      expect(screen.getByRole('status')).toHaveTextContent('Moved 1 photo to Trips');
    });

    it('sends the reverse move on Undo and takes the toast away', async () => {
      renderPage();
      record();

      await userEvent.click(screen.getByRole('button', { name: /undo/i }));

      expect(mockMove).toHaveBeenCalledWith(
        { ids: [1, 2], from: 2, to: { id: 1, name: '' }, isUndo: true },
        expect.anything()
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('dismisses without undoing', async () => {
      renderPage();
      record();

      await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(mockMove).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('times out after 7 seconds', () => {
      vi.useFakeTimers();
      try {
        renderPage();
        record();

        act(() => { vi.advanceTimersByTime(7000); });

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a failed undo on a toast of its own, with nothing to undo', async () => {
      mockMove.mockImplementation((_vars, { onError }) => onError({ message: 'nope' }));
      renderPage();
      record();

      await userEvent.click(screen.getByRole('button', { name: /undo/i }));

      expect(screen.getByRole('status')).toHaveTextContent("Couldn't move the photos. Try again.");
      expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    });

    it('drops the selection and the toast when the folder is left', () => {
      const { unmount } = renderPage();
      act(() => { useSelectionStore.getState().selectAll(1, [1, 2]); });
      record();

      unmount();

      expect(useSelectionStore.getState().lastMove).toBeNull();
      expect([...useSelectionStore.getState().ids]).toEqual([]);
    });
  });
});
