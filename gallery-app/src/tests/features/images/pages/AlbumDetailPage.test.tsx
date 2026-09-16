import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlbumDetailPage } from '@/features/images/pages/AlbumDetailPage';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import { useAlbumImageCount } from '@/features/images/hooks/useImages';
import type { Album } from '@/features/albums/types/album';

vi.mock('@/features/albums/albums', () => ({
  useGetAlbum: vi.fn(),
  useInfiniteAlbums: vi.fn(),
  useUpdateAlbum: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
}));
vi.mock('@/features/images/hooks/useImages', () => ({ useAlbumImageCount: vi.fn() }));
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
});
