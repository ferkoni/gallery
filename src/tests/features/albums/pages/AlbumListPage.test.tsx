import { describe, expect, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumListPage } from "@/features/albums/pages/AlbumListPage.tsx";
import { useListAlbum } from '@/features/albums/albums';
import { MemoryRouter } from 'react-router-dom';
import { userEvent } from "@testing-library/user-event";

vi.mock('@/features/albums/albums', () => ({
  useListAlbum: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("AlbumListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Loading... while fetching', () => {
    (useListAlbum as Mock).mockReturnValue({ isPending: true, isError: false, data: undefined });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

    expect(screen.getByTestId("loading-label")).toBeInTheDocument();
  });

  it('renders Failed to load albums. on error', () => {
    (useListAlbum as Mock).mockReturnValue({ isPending: false, isError: true, data: undefined });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

    expect(screen.getByTestId("failed-label")).toBeInTheDocument();
  });

  it('renders No albums yet. on empty data', () => {
    (useListAlbum as Mock).mockReturnValue({ isPending: false, isError: false, data: [] });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

    expect(screen.getByTestId("no-album-label")).toBeInTheDocument();
  });

  it('navigates to detail page when album card is clicked', async () => {
    (useListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: [{ id: 10, name: 'AlbumTest', description: null }],
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

    await userEvent.click(screen.getByTestId('album-card-10'));

    expect(mockNavigate).toHaveBeenCalledWith('/albums/10');
  });

  it('renders album cards with items and button', () => {
    (useListAlbum as Mock).mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        { id: 10, name: 'AlbumTest', description: 'some-album-description' },
        { id: 15, name: 'AlbumWithNoDescription', description: null }
      ]
    });
    render(<MemoryRouter><AlbumListPage /></MemoryRouter>);

    expect(screen.getByTestId('album-new-link')).toBeInTheDocument();
    expect(screen.getByTestId('album-name-10')).toHaveTextContent('AlbumTest');
    expect(screen.getByTestId('album-name-15')).toHaveTextContent('AlbumWithNoDescription');
    expect(screen.getByTestId('album-description-10')).toHaveTextContent('some-album-description');
    expect(screen.queryByTestId('album-description-15')).toBeNull();
  });
});
