import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ImageUploadButton } from '@/features/images/components/ImageUploadButton';
import { useUpload } from '@/features/images/hooks/useUpload';

vi.mock('@/features/images/hooks/useUpload');
const mockUseUpload = useUpload as Mock;

describe('ImageUploadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpload.mockReturnValue({ upload: vi.fn() });
  });

  it('renders the upload button', () => {
    render(<ImageUploadButton albumId={1} />);
    expect(screen.getByTestId('upload-button')).toBeInTheDocument();
  });

  it('file input is hidden', () => {
    render(<ImageUploadButton albumId={1} />);
    expect(screen.getByTestId('upload-input')).toHaveClass('hidden');
  });

  it('calls upload once per selected file with empty title', async () => {
    const mockUpload = vi.fn();
    mockUseUpload.mockReturnValue({ upload: mockUpload });
    render(<ImageUploadButton albumId={1} />);

    const file1 = new File(['a'], 'photo1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['b'], 'photo2.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('upload-input'), [file1, file2]);

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledWith(file1, '');
    expect(mockUpload).toHaveBeenCalledWith(file2, '');
  });
});
