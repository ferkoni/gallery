import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { UndoToast } from '@/features/images/components/UndoToast';

describe('UndoToast', () => {
  it('renders the message', () => {
    render(<UndoToast message="Removed from favorites" onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Removed from favorites')).toBeInTheDocument();
  });

  it('calls onUndo when the Undo button is clicked', async () => {
    const onUndo = vi.fn();
    render(<UndoToast message="Removed from favorites" onUndo={onUndo} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<UndoToast message="Removed from favorites" onUndo={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
