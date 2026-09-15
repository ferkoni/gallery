import { useEffect, useMemo, useRef, useState } from 'react';
import { useCombobox } from 'downshift';
import { useDebounce } from '@/hooks/useDebounce';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import type { Album } from '@/features/albums/types/album';

type Props = {
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder?: string;
  // The search filter needs an explicit "All folders"; the move field has no empty choice.
  allowClear?: boolean;
  id?: string;
};

export function AlbumPicker({ value, onChange, placeholder, allowClear, id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteAlbums(debouncedQuery || undefined);
  const albums = useMemo(() => data?.pages.flatMap(page => page.data) ?? [], [data]);

  // The selection may sit on a page nobody has loaded — a photo's folder is known only by
  // id — so the label is fetched by id instead of looked up in the loaded pages. That is
  // the whole of both display bugs the old <select> had. The loaded pages are still worth
  // consulting first: they answer instantly for a folder the user just picked.
  const { data: fetchedAlbum } = useGetAlbum(value ?? 0, { enabled: value !== undefined });
  const selected = useMemo(
    () => albums.find(album => album.id === value) ?? fetchedAlbum ?? null,
    [albums, value, fetchedAlbum]
  );

  const {
    isOpen, getInputProps, getMenuProps, getItemProps, getToggleButtonProps, highlightedIndex,
  } = useCombobox<Album>({
    items: albums,
    itemToString: (album) => album?.name ?? '',
    // Compare folders by id: `selected` is rebuilt whenever a page loads, and a
    // reference comparison would read each rebuild as the selection changing.
    itemToKey: (album) => album?.id ?? null,
    // Open, the input is the name filter and starts empty; closed, it names the selection.
    inputValue: open ? query : (selected?.name ?? ''),
    // Controlled, so re-picking the folder that was just cleared still counts as a change.
    selectedItem: selected,
    // Only while the menu is open: closing makes Downshift put the selected folder's
    // name back in the box, which is a label, not something to filter by.
    onInputValueChange: ({ inputValue, isOpen: nowOpen }) => {
      if (nowOpen) setQuery(inputValue ?? '');
    },
    // Closing drops the filter, so the box goes back to naming the selection.
    onIsOpenChange: ({ isOpen: nowOpen }) => {
      setOpen(nowOpen === true);
      if (!nowOpen) setQuery('');
    },
    onSelectedItemChange: ({ selectedItem }) => onChange(selectedItem?.id),
  });

  const sentinelRef = useSentinel(isOpen && hasNextPage && !isFetchingNextPage, fetchNextPage);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          // Focusing selects the folder name already in the box, so the first keystroke
          // starts a filter instead of appending to it.
          {...getInputProps({ id, placeholder, onFocus: (e) => e.currentTarget.select() })}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="album-picker-input"
        />
        {allowClear && value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-sm text-gray-500 hover:text-gray-800 px-2 cursor-pointer"
            data-testid="album-picker-clear"
          >
            Clear
          </button>
        )}
        <button
          {...getToggleButtonProps({ type: 'button', 'aria-label': 'Toggle folder list' })}
          className="text-sm text-gray-500 px-2 cursor-pointer"
          data-testid="album-picker-toggle"
        >
          ▾
        </button>
      </div>

      <ul
        {...getMenuProps()}
        className={`absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg ${isOpen ? '' : 'hidden'}`}
        data-testid="album-picker-menu"
      >
        {isOpen && albums.map((album, index) => (
          <li
            key={album.id}
            {...getItemProps({ item: album, index })}
            className={`px-3 py-2 text-sm cursor-pointer ${highlightedIndex === index ? 'bg-blue-50' : ''}`}
            data-testid={`album-picker-option-${album.id}`}
          >
            {album.name}
          </li>
        ))}
        {isOpen && albums.length === 0 && (
          <li className="px-3 py-2 text-sm text-gray-400" data-testid="album-picker-empty">
            No folders match.
          </li>
        )}
        {isOpen && hasNextPage && (
          <li
            ref={sentinelRef}
            className="px-3 py-2 text-sm text-gray-400"
            data-testid="album-picker-sentinel"
          >
            Loading more…
          </li>
        )}
      </ul>
    </div>
  );
}

// Pages in the next set of folders when the sentinel scrolls into view. jsdom has no
// IntersectionObserver, so tests install a stub and trigger the intersection by hand.
function useSentinel(enabled: boolean, onIntersect: () => void) {
  const ref = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onIntersect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onIntersect]);

  return ref;
}
