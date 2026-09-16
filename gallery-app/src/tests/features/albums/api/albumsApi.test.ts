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
    mock.onGet('/albums').reply(200, {
      data: [{ attributes: { id: 1, name: 'Holidays', description: null, parent_id: null, created_at: '2026-01-01T00:00:00.000Z' } }],
      meta,
    });
  });

  it('unwraps the attributes and returns the pagination meta', async () => {
    const page = await fetchAlbumPage();

    expect(page.data).toEqual([{ id: 1, name: 'Holidays', description: null, parent_id: null, created_at: '2026-01-01T00:00:00.000Z' }]);
    expect(page.meta).toEqual(meta);
  });

  it('requests the page it is given', async () => {
    await fetchAlbumPage(2);
    expect(mock.history.get[0].params).toEqual({ page: 2 });
  });

  it('sends q when there is a name filter', async () => {
    await fetchAlbumPage(1, { q: 'summer' });
    expect(mock.history.get[0].params).toEqual({ page: 1, q: 'summer' });
  });

  it('omits q for an empty filter, so the list is unfiltered', async () => {
    await fetchAlbumPage(1, { q: '' });
    expect(mock.history.get[0].params).toEqual({ page: 1 });
  });

  it('sends parent_id to list one level of the tree', async () => {
    await fetchAlbumPage(1, { parentId: 7 });
    expect(mock.history.get[0].params).toEqual({ page: 1, parent_id: 7 });
  });

  it('omits parent_id for the top level, which has no parent to name', async () => {
    await fetchAlbumPage(1, {});
    expect(mock.history.get[0].params).toEqual({ page: 1 });
  });

  it('sends exclude_subtree so a search cannot offer a folder inside itself', async () => {
    await fetchAlbumPage(1, { q: 'a', excludeSubtree: 3 });
    expect(mock.history.get[0].params).toEqual({ page: 1, q: 'a', exclude_subtree: 3 });
  });
});
