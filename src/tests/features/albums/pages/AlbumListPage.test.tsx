import { describe, expect, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumListPage } from "@/features/albums/pages/AlbumListPage.tsx";
import { usePagedListAlbum } from '@/features/albums/albums';
import { MemoryRouter } from 'react-router-dom';
import { userEvent } from "@testing-library/user-event";
import type { PaginatedResponse } from "@/lib/api/createCrudApi";
import type { Album } from "@/features/albums/types/album";

vi.mock('@/features/albums/albums', () => ({
  usePagedListAlbum: vi.fn(),
  useUpdateAlbum: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const meta = { current_page: 1, total_pages: 1, total_count: 2, per_page: 25 };

function pagedData(albums: Album[], overrideMeta = {}): PaginatedResponse<Album> {
  return { data: albums, meta: { ...meta, ...overrideMeta } };
}

describe("AlbumListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Loading... while fetching', () => {
    (usePagedListAlbum as Mock).mockReturnValue({ isPending: true, isError: false, data: undefined });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId("loading-label")).toBeInTheDocument();
  });

  it('renders Failed to load albums. on error', () => {
    (usePagedListAlbum as Mock).mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId("failed-label")).toBeInTheDocument();
  });

  it('renders No albums yet. on empty data', () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId("no-album-label")).toBeInTheDocument();
  });

  it('navigates to detail page when album card is clicked', async () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([{ id: 10, name: 'AlbumTest', description: null, created_at: '' }]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    await userEvent.click(screen.getByTestId('album-card-10'));
    expect(mockNavigate).toHaveBeenCalledWith('/albums/10');
  });

  it('renders album cards with items and button', () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([
        { id: 10, name: 'AlbumTest', description: 'some-album-description', created_at: '' },
        { id: 15, name: 'AlbumWithNoDescription', description: null, created_at: '' },
      ]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId('album-new-link')).toBeInTheDocument();
    expect(screen.getByTestId('album-name-10')).toHaveTextContent('AlbumTest');
    expect(screen.getByTestId('album-name-15')).toHaveTextContent('AlbumWithNoDescription');
    expect(screen.getByTestId('album-description-10')).toHaveTextContent('some-album-description');
    expect(screen.queryByTestId('album-description-15')).toBeNull();
  });

  it('renders an edit button for each album card', () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([
        { id: 10, name: 'AlbumTest', description: null, created_at: '' },
        { id: 15, name: 'Another', description: null, created_at: '' },
      ]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId('edit-album-button-10')).toBeInTheDocument();
    expect(screen.getByTestId('edit-album-button-15')).toBeInTheDocument();
  });

  it('opens the edit modal when the edit button is clicked', async () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([{ id: 10, name: 'AlbumTest', description: null, created_at: '' }]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    await userEvent.click(screen.getByTestId('edit-album-button-10'));
    expect(screen.getByTestId('album-edit-modal')).toBeInTheDocument();
    expect(screen.getByTestId('edit-name-input')).toHaveValue('AlbumTest');
  });

  it('does not navigate to detail page when the edit button is clicked', async () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([{ id: 10, name: 'AlbumTest', description: null, created_at: '' }]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    await userEvent.click(screen.getByTestId('edit-album-button-10'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('closes the edit modal when the cancel button is clicked', async () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([{ id: 10, name: 'AlbumTest', description: null, created_at: '' }]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    await userEvent.click(screen.getByTestId('edit-album-button-10'));
    await userEvent.click(screen.getByTestId('edit-cancel-button'));
    expect(screen.queryByTestId('album-edit-modal')).not.toBeInTheDocument();
  });

  it('does not show pagination when there is only one page', () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData([{ id: 1, name: 'A', description: null, created_at: '' }]),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('shows pagination when there are multiple pages', () => {
    (usePagedListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: pagedData(
        [{ id: 1, name: 'A', description: null, created_at: '' }],
        { total_pages: 3 }
      ),
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });
});
