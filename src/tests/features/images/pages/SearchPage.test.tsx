import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SearchPage } from '@/features/images/pages/SearchPage';
import { useSearchImages } from '@/features/images/hooks/useImages';
import { useListAlbum } from '@/features/albums/albums';
import type { Image } from '@/features/images/types/image';

vi.mock('@/features/images/hooks/useImages', () => ({
  useSearchImages: vi.fn(),
}));

vi.mock('@/features/albums/albums', () => ({
  useListAlbum: vi.fn(() => ({ data: [] })),
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
const mockUseListAlbum = useListAlbum as Mock;

const images: Image[] = [
  { id: 1, title: 'Sunset Beach', description: null, tags: ['beach'], s3_key: 'k1', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url1' },
  { id: 2, title: 'Mountain Trail', description: null, tags: ['nature'], s3_key: 'k2', album_id: 1, favorited: false, created_at: '2026-01-01T00:00:00.000Z', url: 'https://url2' },
];

function renderSearchPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/search${search}`]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListAlbum.mockReturnValue({ data: [] });
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
    expect(screen.getByPlaceholderText('Title or tag…')).toHaveValue('sunset');
  });

  it('renders album options in the dropdown', () => {
    mockUseSearchImages.mockReturnValue({ data: [], isPending: false, isError: false });
    mockUseListAlbum.mockReturnValue({ data: [{ id: 1, name: 'Summer 2026', description: null, created_at: '2026-01-01' }] });
    renderSearchPage();
    expect(screen.getByRole('option', { name: 'Summer 2026' })).toBeInTheDocument();
  });

  describe('useMemo client-side filtering', () => {
    it('filters loaded results by live q for instant feedback', () => {
      mockUseSearchImages.mockReturnValue({ data: images, isPending: false, isError: false });
      renderSearchPage('?q=sunset');
      expect(screen.getByTestId('image-card-1')).toBeInTheDocument();
      expect(screen.queryByTestId('image-card-2')).not.toBeInTheDocument();
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
      renderSearchPage('?q=nomatch');
      expect(screen.getByTestId('search-empty')).toBeInTheDocument();
    });
  });
});
