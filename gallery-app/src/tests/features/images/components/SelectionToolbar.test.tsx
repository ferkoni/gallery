import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { SelectionToolbar } from '@/features/images/components/SelectionToolbar';
import { MAX_MOVE } from '@/features/images/api/imagesApi';

const props = {
  count: 2,
  loadedCount: 10,
  onSelectAll: vi.fn(),
  onClear: vi.fn(),
  onMove: vi.fn(),
  moving: false,
};

describe('SelectionToolbar', () => {
  it('renders nothing with an empty selection', () => {
    render(<SelectionToolbar {...props} count={0} />);
    expect(screen.queryByTestId('selection-toolbar')).not.toBeInTheDocument();
  });

  it('announces the count politely', () => {
    render(<SelectionToolbar {...props} />);
    expect(screen.getByText('2 selected')).toHaveAttribute('aria-live', 'polite');
  });

  it('offers Select all with the loaded count', async () => {
    const onSelectAll = vi.fn();
    render(<SelectionToolbar {...props} onSelectAll={onSelectAll} />);

    await userEvent.click(screen.getByRole('button', { name: 'Select all (10)' }));

    expect(onSelectAll).toHaveBeenCalledOnce();
  });

  it('hides Select all once everything loaded is selected', () => {
    render(<SelectionToolbar {...props} count={10} />);
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
  });

  it('clears', async () => {
    const onClear = vi.fn();
    render(<SelectionToolbar {...props} onClear={onClear} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('opens the move dialog', async () => {
    const onMove = vi.fn();
    render(<SelectionToolbar {...props} onMove={onMove} />);

    await userEvent.click(screen.getByTestId('move-images-button'));

    expect(onMove).toHaveBeenCalledOnce();
  });

  it('disables Move to… while a move is running', () => {
    render(<SelectionToolbar {...props} moving />);
    expect(screen.getByTestId('move-images-button')).toBeDisabled();
  });

  it('disables Move to… above the batch limit, and says why', () => {
    render(<SelectionToolbar {...props} count={MAX_MOVE + 1} loadedCount={MAX_MOVE + 1} />);

    expect(screen.getByTestId('move-images-button')).toBeDisabled();
    expect(screen.getByTestId('move-limit-hint')).toHaveTextContent('Move up to 500 photos at a time');
  });

  it('allows exactly the batch limit', () => {
    render(<SelectionToolbar {...props} count={MAX_MOVE} loadedCount={MAX_MOVE} />);

    expect(screen.getByTestId('move-images-button')).toBeEnabled();
    expect(screen.queryByTestId('move-limit-hint')).not.toBeInTheDocument();
  });
});
