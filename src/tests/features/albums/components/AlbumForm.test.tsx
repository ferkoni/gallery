import { describe, type Mock, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumForm } from "@/features/albums/components/AlbumForm.tsx";
import { useCreateAlbum } from "@/features/albums/albums.ts";
import { MemoryRouter } from "react-router-dom";
import { userEvent } from "@testing-library/user-event/dist/cjs/setup/index.js";

vi.mock('@/features/albums/albums', () => ({
  useCreateAlbum: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('AlbumForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form inputs and buttons', () => {
    (useCreateAlbum as Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
    render(<MemoryRouter><AlbumForm></AlbumForm></MemoryRouter>);

    expect(screen.getByTestId('name-input')).toBeInTheDocument();
    expect(screen.getByTestId('description-input')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
  });

  it('renders Creating... label for submit button', () => {
    (useCreateAlbum as Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      isError: false,
      isSuccess: false
    });
    render(<MemoryRouter><AlbumForm></AlbumForm></MemoryRouter>);

    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Creating...');
  });

  it('renders Failed to create album. on error', () => {
    (useCreateAlbum as Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: true,
      isSuccess: false
    });
    render(<MemoryRouter><AlbumForm></AlbumForm></MemoryRouter>);

    expect(screen.getByTestId('error-label')).toBeInTheDocument();
    expect(screen.getByTestId('error-label')).toHaveTextContent('Failed to create album.');
  });

  it('navigates to /albums on successful create', async () => {
    const mockMutate = vi.fn((_data, { onSuccess }) => onSuccess());

    (useCreateAlbum as Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
    });

    render(<MemoryRouter><AlbumForm /></MemoryRouter>);

    await userEvent.type(screen.getByTestId('name-input'), 'My Album');
    await userEvent.type(screen.getByTestId('description-input'), 'A description');
    await userEvent.click(screen.getByTestId('submit-button'));

    expect(mockMutate).toHaveBeenCalledWith(
      { name: 'My Album', description: 'A description' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/albums');
  });

  it('navigates to /albums on Cancel', async () => {
    (useCreateAlbum as Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false
    });
    render(<MemoryRouter><AlbumForm></AlbumForm></MemoryRouter>);

    await userEvent.click(screen.getByTestId('cancel-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/albums');
  });
});