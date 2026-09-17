import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { AlbumPicker } from '@/features/albums/components/AlbumPicker';
import { useGetAlbum, useInfiniteAlbums } from '@/features/albums/albums';
import type { Album } from '@/features/albums/types/album';

vi.mock('@/features/albums/albums', () => ({
  useGetAlbum: vi.fn(),
  useInfiniteAlbums: vi.fn(),
}));

// The picker debounces the name filter; the delay is useDebounce's own test to keep.
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (value: unknown) => value }));

const mockUseGetAlbum = useGetAlbum as Mock;
const mockUseInfiniteAlbums = useInfiniteAlbums as Mock;

const album = (id: number, name: string, ancestors?: { id: number; name: string }[]): Album => ({
  id, name, description: null, parent_id: ancestors?.at(-1)?.id ?? null,
  created_at: '2026-01-01T00:00:00.000Z', ancestors,
});

// What the hook was last asked for, which is where level browsing and searching show up.
const lastRequest = () => mockUseInfiniteAlbums.mock.lastCall?.[0];

const fetchNextPage = vi.fn();

type QueryState = {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  // True while the rows on screen still belong to the previous name filter.
  isPlaceholderData?: boolean;
};

function stubPages(pages: Album[][], state: QueryState = {}) {
  mockUseInfiniteAlbums.mockReturnValue({
    data: { pages: pages.map(data => ({ data, meta: {} })) },
    fetchNextPage,
    hasNextPage: state.hasNextPage ?? false,
    isFetchingNextPage: state.isFetchingNextPage ?? false,
    isPending: false,
    isPlaceholderData: state.isPlaceholderData ?? false,
  });
}

// Nothing loaded yet: no data at all, which is what a first open looks like.
function stubPending() {
  mockUseInfiniteAlbums.mockReturnValue({
    data: undefined,
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: true,
    isPlaceholderData: false,
  });
}

// jsdom has no IntersectionObserver. This stub records the observed nodes so a test can
// say "the sentinel scrolled into view" by hand.
let intersect: () => void;
let scrollPast: () => void;
function installIntersectionObserver() {
  intersect = () => {};
  scrollPast = () => {};
  vi.stubGlobal('IntersectionObserver', class {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe(node: Element) {
      const fire = (isIntersecting: boolean) => this.callback(
        [{ isIntersecting, target: node } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
      intersect = () => fire(true);
      scrollPast = () => fire(false);
    }
    disconnect() { intersect = () => {}; scrollPast = () => {}; }
    unobserve() {}
  });
}

describe('AlbumPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installIntersectionObserver();
    mockUseGetAlbum.mockReturnValue({ data: undefined });
    stubPages([[album(1, 'Holidays'), album(2, 'Family')]]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('names the selection even when it is on no loaded page', () => {
    stubPages([[album(1, 'Holidays')]]);
    mockUseGetAlbum.mockReturnValue({ data: album(40, 'Archive 2019') });

    render(<AlbumPicker label="Folder" value={40} onChange={vi.fn()} />);

    expect(screen.getByTestId('album-picker-input')).toHaveValue('Archive 2019');
  });

  it('lists the loaded folders when opened', async () => {
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-option-1')).toHaveTextContent('Holidays');
    expect(screen.getByTestId('album-picker-option-2')).toHaveTextContent('Family');
  });

  it('asks the server for the typed name, and for everything again once cleared', async () => {
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.type(screen.getByTestId('album-picker-input'), 'fam');
    expect(mockUseInfiniteAlbums).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'fam' }));

    await userEvent.clear(screen.getByTestId('album-picker-input'));
    expect(mockUseInfiniteAlbums).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }));
  });

  it('goes back to naming the selection when the menu is dismissed', async () => {
    mockUseGetAlbum.mockReturnValue({ data: album(1, 'Holidays') });
    render(<AlbumPicker label="Folder" value={1} onChange={vi.fn()} />);

    await userEvent.type(screen.getByTestId('album-picker-input'), 'fam');
    await userEvent.keyboard('{Escape}');

    expect(screen.getByTestId('album-picker-input')).toHaveValue('Holidays');
    expect(mockUseInfiniteAlbums).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }));
  });

  it('says so when nothing matches the typed name', async () => {
    stubPages([[]]);
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-empty')).toBeInTheDocument();
  });

  // Every keystroke starts a fresh query, which has nothing cached. Showing the previous
  // filter's rows until the new ones arrive is what keeps typing from blinking.
  describe('while a new name filter is in flight', () => {
    it('keeps the folders already on screen instead of emptying the list', async () => {
      stubPages([[album(1, 'Holidays')]], { isPlaceholderData: true });
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));

      expect(screen.getByTestId('album-picker-option-1')).toBeInTheDocument();
      expect(screen.queryByTestId('album-picker-empty')).not.toBeInTheDocument();
    });

    it('does not page on from a list that is about to be replaced', async () => {
      stubPages([[album(1, 'Holidays')]], { hasNextPage: true, isPlaceholderData: true });
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      intersect();

      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  it('says it is still loading rather than that nothing matches, before the first page', async () => {
    stubPending();
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('album-picker-empty')).not.toBeInTheDocument();
  });

  it('reports the folder that was clicked', async () => {
    const onChange = vi.fn();
    render(<AlbumPicker label="Folder" value={undefined} onChange={onChange} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    await userEvent.click(screen.getByTestId('album-picker-option-2'));

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('reports the folder chosen with the arrow keys and Enter', async () => {
    const onChange = vi.fn();
    render(<AlbumPicker label="Folder" value={undefined} onChange={onChange} />);

    const input = screen.getByTestId('album-picker-input');
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('loads the next page when the sentinel scrolls into view', async () => {
    stubPages([[album(1, 'Holidays')]], { hasNextPage: true });
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    intersect();

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it('waits for the sentinel to actually come into view', async () => {
    stubPages([[album(1, 'Holidays')]], { hasNextPage: true });
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    scrollPast();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('has no sentinel to load past the last page', async () => {
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    intersect();

    expect(screen.queryByTestId('album-picker-sentinel')).not.toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not ask for the same page twice while it is still loading', async () => {
    stubPages([[album(1, 'Holidays')]], { hasNextPage: true, isFetchingNextPage: true });
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    intersect();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('offers a clear button only when clearing is allowed and something is selected', () => {
    mockUseGetAlbum.mockReturnValue({ data: album(1, 'Holidays') });
    const { rerender } = render(<AlbumPicker label="Folder" value={1} onChange={vi.fn()} />);
    expect(screen.queryByTestId('album-picker-clear')).not.toBeInTheDocument();

    rerender(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} allowClear />);
    expect(screen.queryByTestId('album-picker-clear')).not.toBeInTheDocument();

    rerender(<AlbumPicker label="Folder" value={1} onChange={vi.fn()} allowClear />);
    expect(screen.getByTestId('album-picker-clear')).toBeInTheDocument();
  });

  it('reports no folder at all when cleared', async () => {
    mockUseGetAlbum.mockReturnValue({ data: album(1, 'Holidays') });
    const onChange = vi.fn();
    render(<AlbumPicker label="Folder" value={1} onChange={onChange} allowClear />);

    await userEvent.click(screen.getByTestId('album-picker-clear'));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  // Browsing a level at a time is how a picker stays usable with a deep tree; typing
  // leaves it, because a search spans the whole forest.
  describe('browsing levels', () => {
    it('starts at the top level', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);
      await userEvent.click(screen.getByTestId('album-picker-toggle'));

      expect(lastRequest()).toMatchObject({ parentId: undefined });
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders');
    });

    it('walks into a folder without selecting it', async () => {
      const onChange = vi.fn();
      render(<AlbumPicker label="Folder" value={undefined} onChange={onChange} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      await userEvent.click(screen.getByTestId('album-picker-enter-2'));

      expect(lastRequest()).toMatchObject({ parentId: 2 });
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Family');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('has nothing to walk into before a folder is highlighted', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-input'));
      await userEvent.keyboard('{ArrowRight}');

      expect(lastRequest()).toMatchObject({ parentId: undefined });
    });

    it('walks in with the right arrow key, which the empty input has no use for', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-input'));
      await userEvent.keyboard('{ArrowDown}{ArrowRight}');

      expect(lastRequest()).toMatchObject({ parentId: 1 });
    });

    it('offers a way back up, and no way up from the top', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);
      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      expect(screen.queryByTestId('album-picker-up')).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId('album-picker-enter-2'));
      await userEvent.click(screen.getByTestId('album-picker-up'));

      expect(lastRequest()).toMatchObject({ parentId: undefined });
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders');
    });

    describe('opening somewhere other than the top', () => {
      const trips = { id: 1, name: 'Trips' };
      const madrid = { id: 2, name: 'Madrid' };

      it('asks for the given level and names it', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips, madrid ]} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));

        expect(lastRequest()).toMatchObject({ parentId: 2 });
        expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Trips › Madrid');
      });

      it('goes up from there like from anywhere else', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips, madrid ]} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));

        await userEvent.click(screen.getByTestId('album-picker-up'));

        expect(lastRequest()).toMatchObject({ parentId: 1 });
      });
    });

    describe('the path as links', () => {
      const trips = { id: 1, name: 'Trips' };
      const madrid = { id: 2, name: 'Madrid' };
      const day2 = { id: 3, name: 'Day 2' };

      it('jumps straight back to the top from any depth', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips, madrid, day2 ]} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));

        await userEvent.click(screen.getByTestId('album-picker-crumb-root'));

        expect(lastRequest()).toMatchObject({ parentId: undefined });
        expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders');
        // Still open: the jump is browsing, not choosing.
        expect(screen.getByTestId('album-picker-menu')).toBeVisible();
      });

      it('jumps to an ancestor in between', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips, madrid ]} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));

        await userEvent.click(screen.getByTestId('album-picker-crumb-1'));

        expect(lastRequest()).toMatchObject({ parentId: 1 });
        expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Trips');
      });

      it('does not link the level being browsed, nor the top while at the top', async () => {
        const { unmount } = render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips ]} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));
        expect(screen.queryByTestId('album-picker-crumb-1')).not.toBeInTheDocument();
        unmount();

        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));
        expect(screen.queryByTestId('album-picker-crumb-root')).not.toBeInTheDocument();
      });

      it('collapses the middle past two levels, keeping the top and the last two', async () => {
        const deep = [ trips, madrid, day2, { id: 4, name: 'Morning' } ];
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={deep} />);
        await userEvent.click(screen.getByTestId('album-picker-toggle'));

        const header = screen.getByTestId('album-picker-path');
        expect(header).toHaveTextContent('Folders › … › Day 2 › Morning');
        expect(header).toHaveAttribute('title', 'Folders › Trips › Madrid › Day 2 › Morning');
        expect(screen.getByTestId('album-picker-crumb-3')).toBeInTheDocument();
        expect(screen.queryByTestId('album-picker-crumb-1')).not.toBeInTheDocument();
      });
    });

    describe('the left arrow key', () => {
      const trips = { id: 1, name: 'Trips' };
      const madrid = { id: 2, name: 'Madrid' };

      it('goes up one level while browsing', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips, madrid ]} />);
        await userEvent.click(screen.getByTestId('album-picker-input'));

        await userEvent.keyboard('{ArrowLeft}');

        expect(lastRequest()).toMatchObject({ parentId: 1 });
      });

      it('has nowhere to go from the top', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);
        await userEvent.click(screen.getByTestId('album-picker-input'));

        await userEvent.keyboard('{ArrowLeft}');

        expect(lastRequest()).toMatchObject({ parentId: undefined });
      });

      // Closed, the box holds the chosen folder's name, where the key moves the caret.
      it('leaves the caret alone while the menu is closed', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips ]} />);
        screen.getByTestId('album-picker-input').focus();
        await userEvent.keyboard('{ArrowLeft}');

        // Reopened, it's still inside Trips.
        await userEvent.click(screen.getByTestId('album-picker-toggle'));
        expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Trips');
        expect(lastRequest()).toMatchObject({ parentId: 1 });
      });

      it('leaves the caret alone once a name is being typed', async () => {
        render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} initialPath={[ trips ]} />);

        await userEvent.type(screen.getByTestId('album-picker-input'), 'ma{ArrowLeft}');
        expect(screen.getByTestId('album-picker-input')).toHaveValue('ma');

        // Searching sends no level, so the level only shows again once the name is cleared.
        await userEvent.clear(screen.getByTestId('album-picker-input'));
        expect(lastRequest()).toMatchObject({ parentId: 1, q: undefined });
      });
    });

    it('says when a level holds nothing, which is not the same as nothing matching', async () => {
      stubPages([[]]);
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));

      expect(screen.getByTestId('album-picker-empty')).toHaveTextContent('No folders here.');
    });
  });

  describe('searching', () => {
    it('leaves the level behind, so the server searches the whole forest', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      await userEvent.click(screen.getByTestId('album-picker-enter-2'));
      await userEvent.type(screen.getByTestId('album-picker-input'), 'mad');

      expect(lastRequest()).toMatchObject({ q: 'mad', parentId: undefined });
      expect(screen.getByTestId('album-picker-searching')).toBeInTheDocument();
    });

    it('says nothing matched, which is not the same as an empty level', async () => {
      stubPages([[]]);
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.type(screen.getByTestId('album-picker-input'), 'zzz');

      expect(screen.getByTestId('album-picker-empty')).toHaveTextContent('No folders match.');
    });

    it('shows each match with its path, since sibling names may repeat', async () => {
      stubPages([[ album(9, 'Day 2', [ { id: 1, name: 'Trips' }, { id: 2, name: 'Madrid' } ]) ]]);
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.type(screen.getByTestId('album-picker-input'), 'day');

      expect(screen.getByTestId('album-picker-path-9')).toHaveTextContent('Trips › Madrid');
    });

    it('walks into a match at its own level, path and all', async () => {
      stubPages([[ album(9, 'Day 2', [ { id: 1, name: 'Trips' }, { id: 2, name: 'Madrid' } ]) ]]);
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.type(screen.getByTestId('album-picker-input'), 'day');
      await userEvent.click(screen.getByTestId('album-picker-enter-9'));

      expect(lastRequest()).toMatchObject({ parentId: 9, q: undefined });
      // Three levels deep, so the header collapses the middle; the whole path is still its title.
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › … › Madrid › Day 2');
      expect(screen.getByTestId('album-picker-path')).toHaveAttribute('title', 'Folders › Trips › Madrid › Day 2');
    });

    it('returns to the level that was being browsed when the query is cleared', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      await userEvent.click(screen.getByTestId('album-picker-enter-2'));
      await userEvent.type(screen.getByTestId('album-picker-input'), 'mad');
      await userEvent.clear(screen.getByTestId('album-picker-input'));

      expect(lastRequest()).toMatchObject({ parentId: 2, q: undefined });
      expect(screen.getByTestId('album-picker-path')).toHaveTextContent('Folders › Family');
    });
  });

  describe('a folder that cannot be its own parent', () => {
    // Browsing already cannot reach a descendant, but searching spans the forest. Both are
    // closed by asking the server to leave the subtree out of every response.
    it('asks the server to leave it and its subfolders out', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} disabledId={7} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));

      expect(lastRequest()).toMatchObject({ excludeSubtree: 7 });
    });

    it('keeps asking while searching, which is where a cycle could otherwise be offered', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} disabledId={7} />);

      await userEvent.type(screen.getByTestId('album-picker-input'), 'mad');

      expect(lastRequest()).toMatchObject({ q: 'mad', excludeSubtree: 7 });
    });
  });

  describe('the top level as a destination', () => {
    it('is offered only where a folder may have no parent', async () => {
      const { rerender } = render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} />);
      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      expect(screen.queryByTestId('album-picker-top-level')).not.toBeInTheDocument();

      rerender(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} allowTopLevel />);
      expect(screen.getByTestId('album-picker-top-level')).toBeInTheDocument();
    });

    it('is reported as no parent at all', async () => {
      const onChange = vi.fn();
      render(<AlbumPicker label="Folder" value={1} onChange={onChange} allowTopLevel />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      await userEvent.click(screen.getByTestId('album-picker-top-level'));

      expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('names itself in the closed box, so the choice is visible', () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} allowTopLevel />);

      expect(screen.getByTestId('album-picker-input')).toHaveValue('Top level');
    });

    it('is not offered below the top, where it is not where you are', async () => {
      render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} allowTopLevel />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      await userEvent.click(screen.getByTestId('album-picker-enter-2'));

      expect(screen.queryByTestId('album-picker-top-level')).not.toBeInTheDocument();
    });
  });

  it('shows the placeholder when nothing is selected', () => {
    render(<AlbumPicker label="Folder" value={undefined} onChange={vi.fn()} placeholder="All folders" />);

    expect(screen.getByPlaceholderText('All folders')).toHaveValue('');
  });
});
