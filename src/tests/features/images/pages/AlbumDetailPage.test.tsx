import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlbumDetailPage } from '@/features/images/pages/AlbumDetailPage';
import { useGetAlbum } from '@/features/albums/albums';
import { useAlbumImages } from '@/features/images/hooks/useImages';
vi.mock('@/features/albums/albums', () => ({ useGetAlbum: vi.fn() }));
vi.mock('@/features/images/hooks/useImages', () => ({ useAlbumImages: vi.fn() }));
vi.mock('@/features/downloads/components/DownloadAlbumButton', () => ({
  DownloadAlbumButton: ({ disabled }: { disabled?: boolean }) => (
    <button data-testid="download-button" disabled={disabled}>Download Album</button>
  ),
}));
vi.mock('@/features/downloads/components/DownloadQueue', () => ({ DownloadQueue: () => null }));

const mockUseGetAlbum = useGetAlbum as Mock;
const mockUseAlbumImages = useAlbumImages as Mock;

const album = { id: 1, name: 'Summer 2026', description: 'A great summer', created_at: '2026-01-01' };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/albums/1']}>
        <Routes>
          <Route path="/albums/:id" element={<AlbumDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AlbumDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAlbumImages.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: [], meta: { current_page: 1, total_pages: 1, total_count: 0, per_page: 25 } },
    });
  });

  it('renders loading state while album is fetching', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: true, isError: false, data: undefined });
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: true, data: undefined });
    renderPage();
    expect(screen.getByText('Failed to load album.')).toBeInTheDocument();
  });

  it('renders album name and description', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: album });
    renderPage();
    expect(screen.getByText('Summer 2026')).toBeInTheDocument();
    expect(screen.getByText('A great summer')).toBeInTheDocument();
  });

  it('does not render description when it is null', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: { ...album, description: null } });
    renderPage();
    expect(screen.queryByText('A great summer')).not.toBeInTheDocument();
  });

  it('renders the upload button', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: album });
    renderPage();
    expect(screen.getByTestId('upload-button')).toBeInTheDocument();
  });

  it('renders the download button when album has images', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: album });
    mockUseAlbumImages.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: [], meta: { current_page: 1, total_pages: 1, total_count: 3, per_page: 25 } },
    });
    renderPage();
    expect(screen.getByTestId('download-button')).toBeInTheDocument();
    expect(screen.getByTestId('download-button')).not.toBeDisabled();
  });

  it('renders the download button disabled when album has no images', () => {
    mockUseGetAlbum.mockReturnValue({ isPending: false, isError: false, data: album });
    renderPage();
    expect(screen.getByTestId('download-button')).toBeDisabled();
  });
});
