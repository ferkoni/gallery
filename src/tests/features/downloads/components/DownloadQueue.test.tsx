import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadQueue } from '@/features/downloads/components/DownloadQueue';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';
import { useDownloadAlbum } from '@/features/downloads/hooks/useDownloadAlbum';

vi.mock('@/features/downloads/hooks/useDownloadAlbum', () => ({
  useDownloadAlbum: vi.fn(),
}));

const mockUseDownloadAlbum = vi.mocked(useDownloadAlbum);

beforeEach(() => {
  useDownloadStore.setState({ downloads: {} });
  mockUseDownloadAlbum.mockReturnValue({ downloadAlbum: vi.fn() });
});

describe('DownloadQueue', () => {
  it('renders nothing when there are no downloads', () => {
    const { container } = render(<DownloadQueue />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the queue panel when there are downloads', () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    render(<DownloadQueue />);
    expect(screen.getByTestId('download-queue')).toBeInTheDocument();
  });

  it('renders a toast for each download item', () => {
    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    useDownloadStore.getState().enqueue(2, 20, 'Winter');
    render(<DownloadQueue />);
    expect(screen.getByTestId('download-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('download-item-2')).toBeInTheDocument();
  });

  it('removes the failed item and re-enqueues when retry is clicked', async () => {
    const mockDownloadAlbum = vi.fn();
    mockUseDownloadAlbum.mockReturnValue({ downloadAlbum: mockDownloadAlbum });

    useDownloadStore.getState().enqueue(1, 10, 'Summer');
    useDownloadStore.getState().setFailed(1, 'error');

    render(<DownloadQueue />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(useDownloadStore.getState().downloads[1]).toBeUndefined();
    expect(mockDownloadAlbum).toHaveBeenCalledWith(10, 'Summer');
  });
});
