import { useMemo, useState } from 'react';
import { useCombobox } from 'downshift';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteSentinel } from '@/hooks/useInfiniteSentinel';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import type { Album, AlbumCrumb } from '@/features/albums/types/album';

// "Top level" is an option like any other, so it has to sit in the list Downshift owns.
const TOP_LEVEL = { id: null } as const;
type Option = Album | typeof TOP_LEVEL;

const isTopLevel = (option: Option | null): option is typeof TOP_LEVEL => option?.id === null;

type Props = {
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder?: string;
  // The search filter's "All folders". The move field has no empty choice; it has
  // allowTopLevel instead, which means something different.
  allowClear?: boolean;
  // Offers "Top level" as a destination, for moving a folder out of every other folder.
  allowTopLevel?: boolean;
  // The folder being moved. The server drops it and its descendants from every response,
  // so it is not rendered as a disabled row — there is no row. Browsing cannot reach a
  // descendant either way; this is what stops a SEARCH from offering one and building a
  // cycle, which is why it drives the request rather than only the rendering.
  disabledId?: number;
  // Rendered here rather than by the caller: Downshift points the input's aria-labelledby
  // at a label of its own, so a label outside the component is announced by nobody.
  label: string;
  labelClassName?: string;
};

export function AlbumPicker({
  value, onChange, placeholder, allowClear, allowTopLevel, disabledId, label, labelClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The level being browsed, root last. Empty is the top level.
  const [path, setPath] = useState<AlbumCrumb[]>([]);
  const debouncedQuery = useDebounce(query, 300);

  const level = path.at(-1)?.id;
  // Typing leaves level browsing: a search spans the whole tree, and the server ignores
  // parent_id when it is given a q.
  const searching = debouncedQuery !== '';

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isPlaceholderData } =
    useInfiniteAlbums({
      q: debouncedQuery || undefined,
      parentId: searching ? undefined : level,
      excludeSubtree: disabledId,
    });
  const albums = useMemo(() => data?.pages.flatMap(page => page.data) ?? [], [data]);

  const options: Option[] = useMemo(
    () => (allowTopLevel && !searching && path.length === 0 ? [ TOP_LEVEL, ...albums ] : albums),
    [allowTopLevel, searching, path.length, albums]
  );

  // The selection may sit on a level nobody has browsed to — a photo's folder is known
  // only by id — so the label is fetched by id instead of looked up in the loaded pages.
  // The loaded pages are still worth consulting first: they answer instantly for a folder
  // the user just picked.
  const { data: fetchedAlbum } = useGetAlbum(value ?? 0, { enabled: value !== undefined });
  const selected: Option | null = useMemo(() => {
    if (value === undefined) return allowTopLevel ? TOP_LEVEL : null;
    return albums.find(album => album.id === value) ?? fetchedAlbum ?? null;
  }, [albums, value, fetchedAlbum, allowTopLevel]);

  const selectedName = isTopLevel(selected) ? 'Top level' : (selected?.name ?? '');

  function enter(album: Album) {
    setPath(album.ancestors ? [ ...album.ancestors, crumb(album) ] : [ ...path, crumb(album) ]);
    setQuery('');
  }

  const {
    isOpen, getInputProps, getLabelProps, getMenuProps, getItemProps, getToggleButtonProps,
    highlightedIndex,
  } = useCombobox<Option>({
    items: options,
    itemToString: (option) => (isTopLevel(option) ? 'Top level' : option?.name ?? ''),
    // Compare by id: `selected` is rebuilt whenever a page loads, and a reference
    // comparison would read each rebuild as the selection changing.
    itemToKey: (option) => option?.id ?? null,
    // Open, the input is the name filter and starts empty; closed, it names the selection.
    inputValue: open ? query : selectedName,
    // Controlled, so re-picking the folder that was just cleared still counts as a change.
    selectedItem: selected,
    // Only while the menu is open: closing makes Downshift put the selected folder's name
    // back in the box, which is a label, not something to filter by.
    onInputValueChange: ({ inputValue, isOpen: nowOpen }) => {
      if (nowOpen) setQuery(inputValue ?? '');
    },
    // Closing drops the filter, so the box goes back to naming the selection.
    onIsOpenChange: ({ isOpen: nowOpen }) => {
      setOpen(nowOpen === true);
      if (!nowOpen) setQuery('');
    },
    onSelectedItemChange: ({ selectedItem }) =>
      onChange(isTopLevel(selectedItem) ? undefined : selectedItem?.id),
  });

  // Not while showing placeholder data: the sentinel sits under the previous filter's
  // rows, and paging from there would append the new filter's second page to a list whose
  // first page is not on screen yet.
  const sentinelRef = useInfiniteSentinel<HTMLLIElement>(
    isOpen && hasNextPage && !isFetchingNextPage && !isPlaceholderData,
    fetchNextPage
  );

  return (
    <div className="relative">
      <label {...getLabelProps()} className={labelClassName ?? 'text-sm font-medium text-body'}>
        {label}
      </label>

      <div className="flex gap-2 mt-1">
        <input
          type="text"
          // Focusing selects the folder name already in the box, so the first keystroke
          // starts a filter instead of appending to it.
          {...getInputProps({
            placeholder,
            onFocus: (e) => e.currentTarget.select(),
            // Right arrow walks into the highlighted folder. Safe to take: in browse mode
            // the input is empty, so the key has no caret meaning to steal.
            onKeyDown: (e) => {
              if (e.key !== 'ArrowRight' || searching) return;
              const option = options[highlightedIndex];
              if (option && !isTopLevel(option)) {
                e.preventDefault();
                enter(option);
              }
            },
          })}
          className="flex-1 border border-control rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus"
          data-testid="album-picker-input"
        />
        {allowClear && value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-sm text-muted hover:text-strong px-2 cursor-pointer"
            data-testid="album-picker-clear"
          >
            Clear
          </button>
        )}
        <button
          {...getToggleButtonProps({ type: 'button', 'aria-label': 'Toggle folder list' })}
          className="text-sm text-muted px-2 cursor-pointer"
          data-testid="album-picker-toggle"
        >
          ▾
        </button>
      </div>

      <div
        className={`absolute z-20 mt-1 w-full bg-surface border border-subtle rounded-lg shadow-lg ${isOpen ? '' : 'hidden'}`}
      >
        {isOpen && (
          <div className="px-3 py-2 border-b border-subtle text-xs text-muted">
            {searching ? (
              <span data-testid="album-picker-searching">Searching every folder</span>
            ) : (
              <span data-testid="album-picker-path">
                {[ 'Folders', ...path.map(c => c.name) ].join(' › ')}
              </span>
            )}
          </div>
        )}

        {isOpen && !searching && path.length > 0 && (
          <button
            type="button"
            // Downshift guards the menu itself against this, but not a control beside it:
            // without it the input blurs, the popup closes, and this button is gone before
            // the click lands on it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPath(path.slice(0, -1))}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-hover cursor-pointer"
            data-testid="album-picker-up"
          >
            ↑ {path.length === 1 ? 'Folders' : path.at(-2)!.name}
          </button>
        )}

        <ul
          {...getMenuProps()}
          className="max-h-56 overflow-y-auto"
          data-testid="album-picker-menu"
        >
          {isOpen && options.map((option, index) => (
            <li
              key={option.id ?? 'top-level'}
              {...getItemProps({ item: option, index })}
              // Dimmed while the rows belong to the previous filter, so the swap reads as
              // a refresh rather than a jump.
              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer transition-opacity ${isPlaceholderData ? 'opacity-60' : ''} ${highlightedIndex === index ? 'bg-selected' : ''}`}
              data-testid={isTopLevel(option) ? 'album-picker-top-level' : `album-picker-option-${option.id}`}
            >
              {isTopLevel(option) ? (
                <span className="text-secondary">Top level</span>
              ) : (
                <>
                  <span className="truncate">
                    {option.name}
                    {option.ancestors && option.ancestors.length > 0 && (
                      <span className="text-xs text-faint ml-2" data-testid={`album-picker-path-${option.id}`}>
                        {option.ancestors.map(c => c.name).join(' › ')}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    // Entering is not selecting, so the click must not reach the row.
                    onClick={(e) => { e.stopPropagation(); enter(option); }}
                    aria-label={`Open ${option.name}`}
                    className="text-faint hover:text-body px-1 cursor-pointer"
                    data-testid={`album-picker-enter-${option.id}`}
                  >
                    ›
                  </button>
                </>
              )}
            </li>
          ))}
          {/* Nothing loaded yet is not the same as nothing matching, and saying the second
              while the first is true is a blink. */}
          {isOpen && isPending && (
            <li className="px-3 py-2 text-sm text-faint" data-testid="album-picker-loading">
              Loading folders…
            </li>
          )}
          {isOpen && !isPending && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-faint" data-testid="album-picker-empty">
              {searching ? 'No folders match.' : 'No folders here.'}
            </li>
          )}
          {isOpen && hasNextPage && (
            <li
              ref={sentinelRef}
              className="px-3 py-2 text-sm text-faint"
              data-testid="album-picker-sentinel"
            >
              Loading more…
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

const crumb = (album: Album): AlbumCrumb => ({ id: album.id, name: album.name });
