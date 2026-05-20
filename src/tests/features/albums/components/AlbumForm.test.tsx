import { describe, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumForm } from "@/features/albums/components/AlbumForm.tsx";
import { userEvent } from "@testing-library/user-event";

const defaultProps = {
  title: "Test Title",
  submitLabel: "Submit",
  pendingLabel: "Submitting...",
  errorMessage: "Something went wrong.",
  isPending: false,
  isError: false,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
};

describe('AlbumForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form inputs and buttons', () => {
    render(<AlbumForm {...defaultProps} />);

    expect(screen.getByTestId('name-input')).toBeInTheDocument();
    expect(screen.getByTestId('description-input')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<AlbumForm {...defaultProps} />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('pre-fills inputs from defaultValues', () => {
    render(<AlbumForm {...defaultProps} defaultValues={{ name: 'My Album', description: 'A desc' }} />);

    expect(screen.getByTestId('name-input')).toHaveValue('My Album');
    expect(screen.getByTestId('description-input')).toHaveValue('A desc');
  });

  it('disables submit and shows pendingLabel when isPending', () => {
    render(<AlbumForm {...defaultProps} isPending={true} />);

    expect(screen.getByTestId('submit-button')).toBeDisabled();
    expect(screen.getByTestId('submit-button')).toHaveTextContent('Submitting...');
  });

  it('shows errorMessage when isError', () => {
    render(<AlbumForm {...defaultProps} isError={true} />);

    expect(screen.getByTestId('error-label')).toHaveTextContent('Something went wrong.');
  });

  it('calls onCancel when cancel button is clicked', async () => {
    render(<AlbumForm {...defaultProps} />);

    await userEvent.click(screen.getByTestId('cancel-button'));

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onSubmit with form data when submitted', async () => {
    render(<AlbumForm {...defaultProps} />);

    await userEvent.type(screen.getByTestId('name-input'), 'My Album');
    await userEvent.type(screen.getByTestId('description-input'), 'A description');
    await userEvent.click(screen.getByTestId('submit-button'));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith({ name: 'My Album', description: 'A description' });
  });
});
