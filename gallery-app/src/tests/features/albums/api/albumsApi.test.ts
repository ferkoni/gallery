import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import apiClient from '@/lib/api/client';
import { fetchAlbumPage } from '@/features/albums/api/albumsApi';

const mock = new MockAdapter(apiClient);
afterAll(() => mock.restore());

const meta = { current_page: 1, total_pages: 3, total_count: 60, per_page: 25 };

describe('fetchAlbumPage', () => {
  beforeEach(() => {
    mock.reset();
    mock.onGet('/api/albums').reply(200, {
      data: [{ attributes: { id: 1, name: 'Holidays', description: null, created_at: '2026-01-01T00:00:00.000Z' } }],
      meta,
    });
  });

  it('unwraps the attributes and returns the pagination meta', async () => {
    const page = await fetchAlbumPage();

    expect(page.data).toEqual([{ id: 1, name: 'Holidays', description: null, created_at: '2026-01-01T00:00:00.000Z' }]);
    expect(page.meta).toEqual(meta);
  });

  it('requests the page it is given', async () => {
    await fetchAlbumPage(2);
    expect(mock.history.get[0].params).toEqual({ page: 2 });
  });

  it('sends q when there is a name filter', async () => {
    await fetchAlbumPage(1, 'summer');
    expect(mock.history.get[0].params).toEqual({ page: 1, q: 'summer' });
  });

  it('omits q for an empty filter, so the list is unfiltered', async () => {
    await fetchAlbumPage(1, '');
    expect(mock.history.get[0].params).toEqual({ page: 1 });
  });
});
