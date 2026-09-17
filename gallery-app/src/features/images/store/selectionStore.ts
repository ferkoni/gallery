import { create } from 'zustand';

export type MoveRecord = { ids: number[]; from: number; to: { id: number; name: string } };

type SelectionStore = {
  albumId: number | null;
  ids: ReadonlySet<number>;
  anchorId: number | null;
  lastMove: MoveRecord | null;
  toggle: (albumId: number, id: number) => void;
  selectRange: (albumId: number, orderedIds: number[], toId: number) => void;
  selectAll: (albumId: number, ids: number[]) => void;
  clear: () => void;
  setLastMove: (move: MoveRecord | null) => void;
  reset: () => void;
};

// The ids a call starts from: its own, or nothing at all when the call names a different
// folder than the one selected in. A selection can never leak into another folder even if a
// clear is missed somewhere (docs: select-and-move/02, decision 5).
function currentIds(state: { albumId: number | null; ids: ReadonlySet<number> }, albumId: number) {
  return state.albumId === albumId ? state.ids : new Set<number>();
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  albumId: null,
  ids: new Set<number>(),
  anchorId: null,
  lastMove: null,

  toggle: (albumId, id) =>
    set((s) => {
      // A new Set every time: Zustand compares by reference, and mutating this one in place
      // would leave every subscriber showing the previous selection.
      const ids = new Set(currentIds(s, albumId));
      if (!ids.delete(id)) ids.add(id);
      return { albumId, ids, anchorId: id };
    }),

  // Adds the run between the anchor and toId, so shift-clicking twice unions two runs rather
  // than replacing the first. Both ends are included.
  selectRange: (albumId, orderedIds, toId) =>
    set((s) => {
      const ids = new Set(currentIds(s, albumId));
      const anchor = s.albumId === albumId ? s.anchorId : null;
      const from = anchor === null ? -1 : orderedIds.indexOf(anchor);
      const to = orderedIds.indexOf(toId);

      // No anchor, or an anchor that has since left the grid: there is no run to extend, so
      // this behaves as a plain click.
      if (from === -1 || to === -1) {
        if (!ids.delete(toId)) ids.add(toId);
        return { albumId, ids, anchorId: toId };
      }

      const [start, end] = from <= to ? [from, to] : [to, from];
      for (const id of orderedIds.slice(start, end + 1)) ids.add(id);
      return { albumId, ids, anchorId: toId };
    }),

  selectAll: (albumId, ids) => set({ albumId, ids: new Set(ids), anchorId: null }),

  clear: () => set({ albumId: null, ids: new Set<number>(), anchorId: null }),

  setLastMove: (lastMove) => set({ lastMove }),

  // Leaving the folder page drops the toast too: its Undo names a folder that is no longer
  // on screen, and its 7 s timer belongs to the page that started it.
  reset: () => set({ albumId: null, ids: new Set<number>(), anchorId: null, lastMove: null }),
}));
