import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { SearchPage } from '@/features/images/pages/SearchPage';
import { useSearchImages } from '@/features/images/hooks/useImages';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import type { Image } from '@/features/images/types/image';
import type { Album } from '@/features/albums/types/album';

vi.mock('@/features/images/hooks/useImages', () => ({
  useSearchImages: vi.fn(),
}));

vi.mock('@/features/albums/albums', () => ({
  useGetAlbum: vi.fn(),
  useInfiniteAlbums: vi.fn(),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: vi.fn((value: unknown) => value),
}));

vi.mock('@/features/images/components/ImageCard', () => ({
  ImageCard: ({ image }: { image: Image }) => (
    <div data-testid={`image-card-${image.id}`}>{image.title}</div>
  ),
}));

const mockUseSearchImages = useSearchImages as Mock;
const mockUseGetAlbum = useGetAlbum as Mock;
const mockUseInfiniteAlbums = useInfiniteAlbums as Mock;

const folder = (id: number, name: string): Album => ({
  id, name, description: null, created_at: '2026-01-01T00:00:00.000Z',
});

function stubFolders(albums: Album[]) {
  mockUseInfiniteAlbums.mockReturnValue({
    data: { pages: [{ data: albums, meta: {} }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isPlaceholderData: false,
  });
}

const images: Image[] = [
  { id: 1, title: 'Sunset Beach', description: null, tags: ['beach'], s3_key: 'k1', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1', thumbnail_url: 'https://thumb1' },
  { id: 2, title: 'Mountain Trail', description: null, tags: ['nature'], s3_key: 'k2', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url2', thumbnail_url: 'https://thumb2' },
];

function LocationProbe() {
  const [searchParams] = useSearchParams();
  return <span data-testid="location-search">{searchParams.toString()}</span>;
}

function renderSearchPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/search${search}`]}>
      <Routes>
        <Route path="/search" element={<><SearchPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGetAlbum.mockReturnValue({ data: undefined });
    stubFolders([]);
  });

  it('shows a prompt when no filters are set', () => {
    mockUseSearchImages.mockReturnValue({ data: [], isPending: false, isError: false });
    renderSearchPage();
    expect(screen.getByTestId('search-prompt')).toBeInTheDocument();
  });

  it('shows skeleton while loading with an active filter', () => {
    mockUseSearchImages.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderSearchPage('?q=beach');
    expect(screen.getByTestId('search-skeleton')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', () => {
    mockUseSearchImages.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderSearchPage('?q=beach');
    expect(screen.getByTestId('search-error')).toBeInTheDocument();
  });

  it('shows empty state when results are empty', () => {
    mockUseSearchImages.mockReturnValue({ data: [], isPending: false, isError: false });
    renderSearchPage('?q=beach');
    expect(screen.getByTestId('search-empty')).toBeInTheDocument();
  });

  it('renders a card for each result', () => {
    mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
    renderSearchPage('?from=2025-01-01');
    expect(screen.getByTestId('search-results')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('image-card-2')).toBeInTheDocument();
  });

  it('pre-populates the q input from the URL param', () => {
    mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
    renderSearchPage('?q=sunset');
    expect(screen.getByPlaceholderText('Search your photos…')).toHaveValue('sunset');
  });

  it('lists the folders the server returned', async () => {
    mockUseSearchImages.mockReturnValue({ data: [], isPending: false, isError: false });
    stubFolders([folder(1, 'Summer 2026')]);

    renderSearchPage();
    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-option-1')).toHaveTextContent('Summer 2026');
  });

  // The truncated <select> this picker replaced showed "All albums" for a folder outside
  // the loaded page, so the results were filtered by a folder the page never named — and
  // picking "All albums" fired no change event, which made the filter unclearable.
  describe('a folder filter from the URL', () => {
    beforeEach(() => {
      mockUseSearchImages.mockReturnValue({ data: [], isPending: false, isError: false });
      stubFolders([folder(1, 'Summer 2026')]);
      mockUseGetAlbum.mockReturnValue({ data: folder(40, 'Archive 2019') });
    });

    it('names the folder it is filtering by, even from no loaded page', () => {
      renderSearchPage('?album_id=40');

      expect(screen.getByTestId('album-picker-input')).toHaveValue('Archive 2019');
      expect(mockUseSearchImages).toHaveBeenLastCalledWith(expect.objectContaining({ albumId: 40 }));
    });

    it('drops the filter from the search and the URL when cleared', async () => {
      renderSearchPage('?album_id=40');

      await userEvent.click(screen.getByTestId('album-picker-clear'));

      expect(mockUseSearchImages).toHaveBeenLastCalledWith(expect.objectContaining({ albumId: undefined }));
      expect(screen.getByTestId('location-search')).toHaveTextContent('');
    });
  });

  describe('useMemo client-side filtering', () => {
    // The regression that made semantic search look broken: `q` used to be re-applied
    // here as a substring match on title and tags, which discards every result the
    // server matched by meaning. A photo of a woman is a correct answer for `mujer`
    // with that word nowhere in its metadata.
    it('shows every result the server returned for q, whatever the titles say', () => {
      mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
      renderSearchPage('?q=mujer');
      expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('image-card-2')).toBeInTheDocument();
    });

    it('filters loaded results by live title', () => {
      mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
      renderSearchPage('?title=mountain');
      expect(screen.getByTestId('image-card-2')).toBeInTheDocument();
      expect(screen.queryByTestId('image-card-1')).not.toBeInTheDocument();
    });

    it('filters loaded results by live tag', () => {
      mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
      renderSearchPage('?tag=beach');
      expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
      expect(screen.queryByTestId('image-card-2')).not.toBeInTheDocument();
    });

    it('shows empty state when useMemo filters out all results', () => {
      mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
      renderSearchPage('?title=nomatch');
      expect(screen.getByTestId('search-empty')).toBeInTheDocument();
    });

    // The server decides emptiness for q now, so an empty response is the only way the
    // empty state can be reached from a global search.
    it('shows empty state for q only when the server returned nothing', () => {
      mockUseSearchImages.mockReturnValue({ data: [], isPending: false, isError: false });
      renderSearchPage('?q=elefante');
      expect(screen.getByTestId('search-empty')).toBeInTheDocument();
    });
  });
});
