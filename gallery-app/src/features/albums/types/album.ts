// Shown to users as a "folder". The API, the schema and this code say "album"; the
// rename was UI-only by decision (docs: nested-folders/02, decision 1).
export type Album = {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  created_at: string;
  // Root first, excluding the folder itself. The API sends it on show, and on index rows
  // under ?q= — a flat list of matches with duplicate sibling names needs a path.
  ancestors?: AlbumCrumb[];
};

export type AlbumCrumb = { id: number; name: string };
