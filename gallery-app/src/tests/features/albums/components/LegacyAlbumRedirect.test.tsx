import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { LegacyAlbumRedirect } from '@/features/albums/components/LegacyAlbumRedirect';

function FolderProbe() {
  const { id } = useParams();
  return <p>folder {id}</p>;
}

describe('LegacyAlbumRedirect', () => {
  it('redirects /albums/:id to /folders/:id, keeping the id', () => {
    render(
      <MemoryRouter initialEntries={['/albums/12']}>
        <Routes>
          <Route path="/albums/:id" element={<LegacyAlbumRedirect />} />
          <Route path="/folders/:id" element={<FolderProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('folder 12')).toBeInTheDocument();
  });
});
