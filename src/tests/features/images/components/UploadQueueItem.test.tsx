import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UploadQueueItem } from '@/features/images/components/UploadQueueItem';
import type { UploadItem } from '@/features/images/store/uploadStore';

const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

function makeItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return { id: 'id-1', file, title: 'Beach', albumId: 1, progress: 0, status: 'pending', ...overrides };
}

describe('UploadQueueItem', () => {
  it('renders the filename', () => {
    render(<UploadQueueItem item={makeItem()} />);
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('shows Pending badge and no progress bar', () => {
    render(<UploadQueueItem item={makeItem({ status: 'pending' })} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows Uploading badge and progress bar', () => {
    render(<UploadQueueItem item={makeItem({ status: 'uploading', progress: 40 })} />);
    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '40');
  });

  it('shows Done badge and progress bar at 100', () => {
    render(<UploadQueueItem item={makeItem({ status: 'done', progress: 100 })} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100');
  });

  it('shows Error badge and error message', () => {
    render(<UploadQueueItem item={makeItem({ status: 'error', error: 'File too large' })} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('File too large')).toBeInTheDocument();
  });

  it('shows Error badge without message when error is undefined', () => {
    render(<UploadQueueItem item={makeItem({ status: 'error', error: undefined })} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
