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

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/folders/new${search}`]}>
      <AlbumNewPage />
    </MemoryRouter>
  );
}

describe('AlbumNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create form with correct labels', () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    renderPage();

    expect(screen.getByText('New Folder')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Create');
  });

  it('shows Creating... and disables submit when pending', () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: true, isError: false });
    renderPage();

    expect(screen.getByTestId('submit-button')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Creating...');
  });

  it('shows error message on failure', () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: true });
    renderPage();

    expect(screen.getByTestId('error-label')).toHaveTextContent('Failed to create folder.');
  });

  it('calls mutate with form data and navigates on success', async () => {
    const mockMutate = vi.fn((_data, { onSuccess }) => onSuccess());
    (useCreateAlbum as Mock).mockReturnValue({ mutate: mockMutate, isPending: false, isError: false });
    renderPage();

    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Album' } });
    fireEvent.change(screen.getByTestId('description-input'), { target: { value: 'A description' } });
    await userEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { name: 'My Album', description: 'A description', parent_id: null },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/folders');
    });
  });

  it('navigates to the folder list on cancel', async () => {
    (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    renderPage();

    await userEvent.click(screen.getByTestId('cancel-button'));

    expect(mockNavigate).toHaveBeenCalledWith('/folders');
  });

  // The parent comes from the "New folder here" link on a folder's own page, and from
  // nowhere else — this page has no Location field.
  describe('with ?parent=', () => {
    it('creates the folder underneath that one', async () => {
      const mockMutate = vi.fn((_data, { onSuccess }) => onSuccess());
      (useCreateAlbum as Mock).mockReturnValue({ mutate: mockMutate, isPending: false, isError: false });
      renderPage('?parent=7');

      fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Madrid' } });
      await userEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Madrid', parent_id: 7 }),
          expect.anything()
        );
      });
    });

    it('goes back to the parent folder once it is created', async () => {
      const mockMutate = vi.fn((_data, { onSuccess }) => onSuccess());
      (useCreateAlbum as Mock).mockReturnValue({ mutate: mockMutate, isPending: false, isError: false });
      renderPage('?parent=7');

      fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Madrid' } });
      await userEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/folders/7'));
    });

    it('goes back to the parent folder on cancel too', async () => {
      (useCreateAlbum as Mock).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
      renderPage('?parent=7');

      await userEvent.click(screen.getByTestId('cancel-button'));

      expect(mockNavigate).toHaveBeenCalledWith('/folders/7');
    });
  });
});
