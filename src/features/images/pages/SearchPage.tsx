import { useMemo, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchImages } from '../hooks/useImages';
import { useListAlbum } from '@/features/albums/albums';
import { ImageCard } from '../components/ImageCard';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [title, setTitle] = useState(searchParams.get('title') ?? '');
  const [tag, setTag] = useState(searchParams.get('tag') ?? '');
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [albumId, setAlbumId] = useState<number | undefined>(
    searchParams.get('album_id') ? Number(searchParams.get('album_id')) : undefined
  );

  const skipNextSyncRef = useRef(false);

  // Sync local state when searchParams change externally (e.g., browser back/forward).
  // skipNextSyncRef prevents overwriting live input when the change was triggered by the
  // debounce write-back effect below.
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    setQ(searchParams.get('q') ?? '');
    setTitle(searchParams.get('title') ?? '');
    setTag(searchParams.get('tag') ?? '');
    setFrom(searchParams.get('from') ?? '');
    setAlbumId(searchParams.get('album_id') ? Number(searchParams.get('album_id')) : undefined);
  }, [searchParams]);

  const debouncedQ = useDebounce(q, 300);
  const debouncedTitle = useDebounce(title, 300);
  const debouncedTag = useDebounce(tag, 300);
  const debouncedFrom = useDebounce(from, 300);
  const debouncedAlbumId = useDebounce(albumId, 300);

  useEffect(() => {
    skipNextSyncRef.current = true;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (debouncedQ) { next.set('q', debouncedQ); } else { next.delete('q'); }
      if (debouncedTitle) { next.set('title', debouncedTitle); } else { next.delete('title'); }
      if (debouncedTag) { next.set('tag', debouncedTag); } else { next.delete('tag'); }
      if (debouncedFrom) { next.set('from', debouncedFrom); } else { next.delete('from'); }
      if (debouncedAlbumId !== undefined) { next.set('album_id', String(debouncedAlbumId)); } else { next.delete('album_id'); }
      return next;
    }, { replace: true });
  }, [debouncedQ, debouncedTitle, debouncedTag, debouncedFrom, debouncedAlbumId, setSearchParams]);

  const { data: albums = [] } = useListAlbum();
  const { data: images = [], isPending, isError } = useSearchImages({
    q: debouncedQ || undefined,
    title: debouncedTitle || undefined,
    tag: debouncedTag || undefined,
    from: debouncedFrom || undefined,
    albumId: debouncedAlbumId,
  });

  const filtered = useMemo(() => {
    return images.filter(img => {
      const lq = debouncedQ.toLowerCase();
      const lt = debouncedTitle.toLowerCase();
      const ltag = debouncedTag.toLowerCase();
      if (debouncedQ && !img.title.toLowerCase().includes(lq) && !img.tags.some(t => t.toLowerCase().includes(lq))) return false;
      if (debouncedTitle && !img.title.toLowerCase().includes(lt)) return false;
      if (debouncedTag && !img.tags.some(t => t.toLowerCase().includes(ltag))) return false;
      return true;
    });
  }, [images, debouncedQ, debouncedTitle, debouncedTag]);

  const hasAnyFilter = q || title || tag || from || albumId !== undefined;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Search</h1>

      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium text-gray-500">Global search</label>
          <input
            type="text"
            placeholder="Title or tag…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium text-gray-500">Title</label>
          <input
            type="text"
            placeholder="Filter by title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium text-gray-500">Tag</label>
          <input
            type="text"
            placeholder="Filter by tag…"
            value={tag}
            onChange={e => setTag(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From date</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium text-gray-500">Album</label>
          <select
            value={albumId ?? ''}
            onChange={e => setAlbumId(e.target.value ? Number(e.target.value) : undefined)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          >
            <option value="">All albums</option>
            {albums.map(album => (
              <option key={album.id} value={album.id}>{album.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!hasAnyFilter && (
        <p className="text-gray-400 text-sm" data-testid="search-prompt">
          Enter a search term or apply a filter to find images.
        </p>
      )}

      {hasAnyFilter && isPending && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4" data-testid="search-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="bg-gray-200 animate-pulse rounded-xl h-48" />
          ))}
        </ul>
      )}

      {hasAnyFilter && isError && (
        <p className="text-red-500 text-sm" data-testid="search-error">Failed to load results.</p>
      )}

      {hasAnyFilter && !isPending && !isError && filtered.length === 0 && (
        <p className="text-gray-400 text-sm" data-testid="search-empty">No images match your filters.</p>
      )}

      {filtered.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4" data-testid="search-results">
          {filtered.map(image => (
            <li key={image.id}>
              <ImageCard image={image} onClick={() => {}} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
