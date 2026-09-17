import { useSelectionStore } from '@/features/images/store/selectionStore';

const ALBUM = 1;
const OTHER_ALBUM = 2;
const state = () => useSelectionStore.getState();
const selected = () => [...state().ids].sort((a, b) => a - b);

describe('selectionStore', () => {
  beforeEach(() => { state().reset(); });

  describe('toggle', () => {
    it('selects a photo', () => {
      state().toggle(ALBUM, 10);

      expect(selected()).toEqual([10]);
      expect(state().albumId).toBe(ALBUM);
    });

    it('deselects one already selected', () => {
      state().toggle(ALBUM, 10);
      state().toggle(ALBUM, 10);

      expect(selected()).toEqual([]);
    });

    it('sets the anchor', () => {
      state().toggle(ALBUM, 10);

      expect(state().anchorId).toBe(10);
    });

    it('builds a new Set, so subscribers notice', () => {
      state().toggle(ALBUM, 10);
      const before = state().ids;
      state().toggle(ALBUM, 11);

      expect(state().ids).not.toBe(before);
    });

    it('starts over when the folder changes', () => {
      state().toggle(ALBUM, 10);
      state().toggle(OTHER_ALBUM, 20);

      expect(selected()).toEqual([20]);
      expect(state().albumId).toBe(OTHER_ALBUM);
    });
  });

  describe('selectRange', () => {
    const ordered = [1, 2, 3, 4, 5];

    it('adds everything between the anchor and the target, inclusive', () => {
      state().toggle(ALBUM, 2);
      state().selectRange(ALBUM, ordered, 4);

      expect(selected()).toEqual([2, 3, 4]);
    });

    it('works backwards', () => {
      state().toggle(ALBUM, 4);
      state().selectRange(ALBUM, ordered, 2);

      expect(selected()).toEqual([2, 3, 4]);
    });

    it('keeps what was selected before, so two runs union', () => {
      state().toggle(ALBUM, 1);
      state().toggle(ALBUM, 4);
      state().selectRange(ALBUM, ordered, 5);

      expect(selected()).toEqual([1, 4, 5]);
    });

    it('moves the anchor to the target', () => {
      state().toggle(ALBUM, 2);
      state().selectRange(ALBUM, ordered, 4);

      expect(state().anchorId).toBe(4);
    });

    it('behaves as a plain toggle with no anchor', () => {
      state().selectRange(ALBUM, ordered, 3);

      expect(selected()).toEqual([3]);
      expect(state().anchorId).toBe(3);
    });

    it('deselects with no anchor, as a plain toggle would', () => {
      state().selectAll(ALBUM, [3]);
      state().selectRange(ALBUM, ordered, 3);

      expect(selected()).toEqual([]);
    });

    it('behaves as a plain toggle when the anchor has left the grid', () => {
      state().toggle(ALBUM, 99);
      state().selectRange(ALBUM, ordered, 3);

      expect(selected()).toEqual([99, 3].sort((a, b) => a - b));
    });

    it('starts over when the folder changes', () => {
      state().toggle(ALBUM, 2);
      state().selectRange(OTHER_ALBUM, ordered, 4);

      expect(selected()).toEqual([4]);
    });
  });

  describe('selectAll', () => {
    it('selects every id given', () => {
      state().selectAll(ALBUM, [1, 2, 3]);

      expect(selected()).toEqual([1, 2, 3]);
      expect(state().albumId).toBe(ALBUM);
    });

    it('drops the anchor, since no one card was clicked', () => {
      state().toggle(ALBUM, 2);
      state().selectAll(ALBUM, [1, 2, 3]);

      expect(state().anchorId).toBeNull();
    });
  });

  describe('clear and reset', () => {
    it('clear empties the selection but keeps the toast', () => {
      state().toggle(ALBUM, 1);
      state().setLastMove({ ids: [1], from: 1, to: { id: 2, name: 'Trips' } });
      state().clear();

      expect(selected()).toEqual([]);
      expect(state().albumId).toBeNull();
      expect(state().lastMove).not.toBeNull();
    });

    it('reset drops the toast too', () => {
      state().toggle(ALBUM, 1);
      state().setLastMove({ ids: [1], from: 1, to: { id: 2, name: 'Trips' } });
      state().reset();

      expect(selected()).toEqual([]);
      expect(state().lastMove).toBeNull();
    });
  });
});
