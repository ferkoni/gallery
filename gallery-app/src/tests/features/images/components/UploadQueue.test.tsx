import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { UploadQueue } from '@/features/images/components/UploadQueue';
import { useUploadStore } from '@/features/images/store/uploadStore';

const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  useUploadStore.setState({ queue: [] });
});

describe('UploadQueue', () => {
  it('renders nothing when queue is empty', () => {
    render(<UploadQueue />);
    expect(screen.queryByTestId('upload-queue')).not.toBeInTheDocument();
  });

  it('renders the overlay when the queue has items', () => {
    useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
    render(<UploadQueue />);
    expect(screen.getByTestId('upload-queue')).toBeInTheDocument();
  });

  it('does not show clear done button when no items are done', () => {
    useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
    render(<UploadQueue />);
    expect(screen.queryByTestId('clear-done-button')).not.toBeInTheDocument();
  });

  it('shows clear done button when at least one item is done', () => {
    useUploadStore.getState().enqueue('id-1', { file, title: 'Beach', albumId: 1 });
    useUploadStore.getState().setStatus('id-1', 'done');
    render(<UploadQueue />);
    expect(screen.getByTestId('clear-done-button')).toBeInTheDocument();
  });

  it('clicking clear done removes done items and keeps the rest', async () => {
    useUploadStore.getState().enqueue('id-1', { file, title: 'A', albumId: 1 });
    useUploadStore.getState().enqueue('id-2', { file, title: 'B', albumId: 1 });
    useUploadStore.getState().setStatus('id-1', 'done');
    render(<UploadQueue />);

    await userEvent.click(screen.getByTestId('clear-done-button'));

    expect(useUploadStore.getState().queue).toHaveLength(1);
    expect(useUploadStore.getState().queue[0].id).toBe('id-2');
  });
});
