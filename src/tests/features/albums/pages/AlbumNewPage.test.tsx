import { describe, type Mock, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AlbumNewPage } from "@/features/albums/pages/AlbumNewPage.tsx";
import { useCreateAlbum } from "@/features/albums/albums.ts";
import { MemoryRouter } from "react-router-dom";
import { userEvent } from "@testing-library/user-event";

vi.mock('@/features/albums/albums', () => ({
  useCreateAlbum: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('AlbumNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create form with correct labels', () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumNewPage /></MemoryRouter>);

    expect(screen.getByText('New Album')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Create');
  });

  it('shows Creating... and disables submit when pending', () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: true, isError: false });
    render(<MemoryRouter><AlbumNewPage /></MemoryRouter>);

    expect(screen.getByTestId('submit-button')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Creating...');
  });

  it('shows error message on failure', () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: true });
    render(<MemoryRouter><AlbumNewPage /></MemoryRouter>);

    expect(screen.getByTestId('error-label')).toHaveTextContent('Failed to create album.');
  });

  it('calls mutate with form data and navigates on success', async () => {
    const mockMutate = vi.fn((_data, { onSuccess }) => onSuccess());
    (useCreateAlbum as Mock).mockReturnValue({ mutate: mockMutate, isPending: false, isError: false });
    render(<MemoryRouter><AlbumNewPage /></MemoryRouter>);

    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Album' } });
    fireEvent.change(screen.getByTestId('description-input'), { target: { value: 'A description' } });
    await userEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'My Album', description: 'A description' },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/albums');
    });
  });

  it('navigates to /albums on cancel', async () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    render(<MemoryRouter><AlbumNewPage /></MemoryRouter>);

    await userEvent.click(screen.getByTestId('cancel-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/albums');
  });
});
