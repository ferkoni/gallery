import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AlbumCard } from '@/features/albums/components/AlbumCard';
import type { Album } from '@/features/albums/types/album';

const album: Album = {
  id: 10, name: 'Madrid', description: 'Spring', parent_id: 1, created_at: '2026-01-01',
};

function renderCard(overrides: Partial<Album> = {}, onEdit = vi.fn()) {
  render(
    <MemoryRouter>
      <ul><AlbumCard album={{ ...album, ...overrides }} onEdit={onEdit} /></ul>
    </MemoryRouter>
  );
  return onEdit;
}

describe('AlbumCard', () => {
  it('links to the folder', () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'Madrid' })).toHaveAttribute('href', '/folders/10');
  });

  it('shows the description when there is one', () => {
    renderCard();
    expect(screen.getByTestId('album-description-10')).toHaveTextContent('Spring');
  });

  it('shows no description line when there is none', () => {
    renderCard({ description: null });
    expect(screen.queryByTestId('album-description-10')).not.toBeInTheDocument();
  });

  it('hands the folder back when its edit button is clicked', async () => {
    const onEdit = renderCard();

    await userEvent.click(screen.getByTestId('edit-album-button-10'));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
  });
});
