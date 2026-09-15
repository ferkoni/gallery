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

const album = (id: number, name: string): Album => ({
  id, name, description: null, created_at: '2026-01-01T00:00:00.000Z',
});

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

    render(<AlbumPicker value={40} onChange={vi.fn()} />);

    expect(screen.getByTestId('album-picker-input')).toHaveValue('Archive 2019');
  });

  it('lists the loaded folders when opened', async () => {
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-option-1')).toHaveTextContent('Holidays');
    expect(screen.getByTestId('album-picker-option-2')).toHaveTextContent('Family');
  });

  it('asks the server for the typed name, and for everything again once cleared', async () => {
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.type(screen.getByTestId('album-picker-input'), 'fam');
    expect(mockUseInfiniteAlbums).toHaveBeenLastCalledWith('fam');

    await userEvent.clear(screen.getByTestId('album-picker-input'));
    expect(mockUseInfiniteAlbums).toHaveBeenLastCalledWith(undefined);
  });

  it('goes back to naming the selection when the menu is dismissed', async () => {
    mockUseGetAlbum.mockReturnValue({ data: album(1, 'Holidays') });
    render(<AlbumPicker value={1} onChange={vi.fn()} />);

    await userEvent.type(screen.getByTestId('album-picker-input'), 'fam');
    await userEvent.keyboard('{Escape}');

    expect(screen.getByTestId('album-picker-input')).toHaveValue('Holidays');
    expect(mockUseInfiniteAlbums).toHaveBeenLastCalledWith(undefined);
  });

  it('says so when nothing matches the typed name', async () => {
    stubPages([[]]);
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-empty')).toBeInTheDocument();
  });

  // Every keystroke starts a fresh query, which has nothing cached. Showing the previous
  // filter's rows until the new ones arrive is what keeps typing from blinking.
  describe('while a new name filter is in flight', () => {
    it('keeps the folders already on screen instead of emptying the list', async () => {
      stubPages([[album(1, 'Holidays')]], { isPlaceholderData: true });
      render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));

      expect(screen.getByTestId('album-picker-option-1')).toBeInTheDocument();
      expect(screen.queryByTestId('album-picker-empty')).not.toBeInTheDocument();
    });

    it('does not page on from a list that is about to be replaced', async () => {
      stubPages([[album(1, 'Holidays')]], { hasNextPage: true, isPlaceholderData: true });
      render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

      await userEvent.click(screen.getByTestId('album-picker-toggle'));
      intersect();

      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  it('says it is still loading rather than that nothing matches, before the first page', async () => {
    stubPending();
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));

    expect(screen.getByTestId('album-picker-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('album-picker-empty')).not.toBeInTheDocument();
  });

  it('reports the folder that was clicked', async () => {
    const onChange = vi.fn();
    render(<AlbumPicker value={undefined} onChange={onChange} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    await userEvent.click(screen.getByTestId('album-picker-option-2'));

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('reports the folder chosen with the arrow keys and Enter', async () => {
    const onChange = vi.fn();
    render(<AlbumPicker value={undefined} onChange={onChange} />);

    const input = screen.getByTestId('album-picker-input');
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('loads the next page when the sentinel scrolls into view', async () => {
    stubPages([[album(1, 'Holidays')]], { hasNextPage: true });
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    intersect();

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it('waits for the sentinel to actually come into view', async () => {
    stubPages([[album(1, 'Holidays')]], { hasNextPage: true });
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    scrollPast();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('has no sentinel to load past the last page', async () => {
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    intersect();

    expect(screen.queryByTestId('album-picker-sentinel')).not.toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not ask for the same page twice while it is still loading', async () => {
    stubPages([[album(1, 'Holidays')]], { hasNextPage: true, isFetchingNextPage: true });
    render(<AlbumPicker value={undefined} onChange={vi.fn()} />);

    await userEvent.click(screen.getByTestId('album-picker-toggle'));
    intersect();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('offers a clear button only when clearing is allowed and something is selected', () => {
    mockUseGetAlbum.mockReturnValue({ data: album(1, 'Holidays') });
    const { rerender } = render(<AlbumPicker value={1} onChange={vi.fn()} />);
    expect(screen.queryByTestId('album-picker-clear')).not.toBeInTheDocument();

    rerender(<AlbumPicker value={undefined} onChange={vi.fn()} allowClear />);
    expect(screen.queryByTestId('album-picker-clear')).not.toBeInTheDocument();

    rerender(<AlbumPicker value={1} onChange={vi.fn()} allowClear />);
    expect(screen.getByTestId('album-picker-clear')).toBeInTheDocument();
  });

  it('reports no folder at all when cleared', async () => {
    mockUseGetAlbum.mockReturnValue({ data: album(1, 'Holidays') });
    const onChange = vi.fn();
    render(<AlbumPicker value={1} onChange={onChange} allowClear />);

    await userEvent.click(screen.getByTestId('album-picker-clear'));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows the placeholder when nothing is selected', () => {
    render(<AlbumPicker value={undefined} onChange={vi.fn()} placeholder="All folders" />);

    expect(screen.getByPlaceholderText('All folders')).toHaveValue('');
  });
});
