import { describe, type Mock, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumEditPage } from "@/features/albums/pages/AlbumEditPage.tsx";
import { useGetAlbum, useUpdateAlbum } from "@/features/albums/albums.ts";
import { MemoryRouter } from "react-router-dom";
import { userEvent } from "@testing-library/user-event";

vi.mock('@/features/albums/albums', () => ({
  useGetAlbum: vi.fn(),
  useUpdateAlbum: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: '42' }) };
});

const album = { id: 42, name: 'My Album', description: 'A description', created_at: '2024-01-01' };

describe('AlbumEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: undefined, isPending: false, isError: true });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(screen.getByText('Failed to load album.')).toBeInTheDocument();
  });

  it('shows error state when album is undefined', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: undefined, isPending: false, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(screen.getByText('Failed to load album.')).toBeInTheDocument();
  });

  it('calls useGetAlbum with the numeric id from params', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(useGetAlbum).toHaveBeenCalledWith(42);
  });

  it('renders edit form with correct labels and default values', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: album, isPending: false, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(screen.getByText('Edit Album')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Save');
    expect(screen.getByTestId('name-input')).toHaveValue('My Album');
    expect(screen.getByTestId('description-input')).toHaveValue('A description');
  });

  it('shows Saving... and disables submit when update is pending', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: album, isPending: false, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: true, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(screen.getByTestId('submit-button')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Saving...');
  });

  it('shows error message when update fails', () => {
    (useGetAlbum as Mock).mockReturnValue({ data: album, isPending: false, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: true });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    expect(screen.getByTestId('error-label')).toHaveTextContent('Failed to update album.');
  });

  it('calls mutate with album id and form data and navigates on success', async () => {
    const mockMutate = vi.fn((_data, { onSuccess }) => onSuccess());
    (useGetAlbum as Mock).mockReturnValue({ data: album, isPending: false, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: mockMutate, isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    await userEvent.clear(screen.getByTestId('name-input'));
    await userEvent.type(screen.getByTestId('name-input'), 'Updated Album');
    await userEvent.click(screen.getByTestId('submit-button'));

    expect(mockMutate).toHaveBeenCalledWith(
      { id: 42, body: { name: 'Updated Album', description: 'A description' } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/albums');
  });

  it('navigates to /albums on cancel', async () => {
    (useGetAlbum as Mock).mockReturnValue({ data: album, isPending: false, isError: false });
    (useUpdateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumEditPage /></MemoryRouter>);

    await userEvent.click(screen.getByTestId('cancel-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/albums');
  });
});
