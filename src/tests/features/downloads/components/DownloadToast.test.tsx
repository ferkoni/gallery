import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadToast } from '@/features/downloads/components/DownloadToast';
import { useDownloadStore } from '@/features/downloads/store/downloadStore';
import type { DownloadItem } from '@/features/downloads/store/downloadStore';

beforeEach(() => {
  useDownloadStore.setState({ downloads: { 1: { taskId: 1, albumName: 'Summer', status: 'pending' } } });
});

const pendingItem: DownloadItem = { taskId: 1, albumName: 'Summer', status: 'pending' };
const readyItem: DownloadItem = { taskId: 1, albumName: 'Summer', status: 'ready', url: 'https://example.com/file.zip' };
const failedItem: DownloadItem = { taskId: 1, albumName: 'Summer', status: 'failed', error: 'S3 upload failed' };

describe('DownloadToast', () => {
  it('renders album name', () => {
    render(<DownloadToast item={pendingItem} />);
    expect(screen.getByText('Summer')).toBeInTheDocument();
  });

  it('renders "Preparing…" status label for pending', () => {
    render(<DownloadToast item={pendingItem} />);
    expect(screen.getByText('Preparing…')).toBeInTheDocument();
  });

  it('renders "Ready" status label and a download link for ready status', () => {
    render(<DownloadToast item={readyItem} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Save file' });
    expect(link).toHaveAttribute('href', 'https://example.com/file.zip');
    expect(link).toHaveAttribute('download');
  });

  it('renders "Failed" status label and error message for failed status', () => {
    render(<DownloadToast item={failedItem} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('S3 upload failed')).toBeInTheDocument();
  });

  it('renders "Try again" button for failed status when onRetry is provided', () => {
    const onRetry = vi.fn();
    render(<DownloadToast item={failedItem} onRetry={onRetry} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('calls onRetry with the item when "Try again" is clicked', async () => {
    const onRetry = vi.fn();
    render(<DownloadToast item={failedItem} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledWith(failedItem);
  });

  it('does not render dismiss button for pending status', () => {
    render(<DownloadToast item={pendingItem} />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('renders dismiss button for ready status and removes item on click', async () => {
    useDownloadStore.setState({ downloads: { 1: { ...readyItem } } });
    render(<DownloadToast item={readyItem} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useDownloadStore.getState().downloads[1]).toBeUndefined();
  });

  it('renders dismiss button for failed status and removes item on click', async () => {
    render(<DownloadToast item={failedItem} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useDownloadStore.getState().downloads[1]).toBeUndefined();
  });
});
