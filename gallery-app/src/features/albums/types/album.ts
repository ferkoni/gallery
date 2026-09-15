// Shown to users as a "folder". The API, the schema and this code say "album"; the
// rename was UI-only by decision (docs: nested-folders/02, decision 1).
export type Album = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};