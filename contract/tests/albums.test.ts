import { beforeEach, describe, expect, it } from "vitest";
import { api, del, get, patch, post } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { idsOf, snapshotOf } from "../src/support/normalise.js";

// The owner's tree is drawn in src/support/fixtures.ts: 1 > 4 > 5 with images in
// 1 and 5, 2 > 6 with no images, 7 tied with 2 on created_at. Album 3 belongs to
// stranger. Nested folders: nested-folders/02 decisions 8, 12 and 14.
describe("albums", () => {
  beforeEach(async () => {
    await resetData();
  });

  describe("GET /api/v1/albums", () => {
    it("returns the current user's albums with Kaminari meta", async () => {
      const response = await get(api("/albums"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("never leaks another user's albums", async () => {
      const response = await get(api("/albums"), { token: tokenFor("stranger") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The default page size is Kaminari's 25 — no paginates_per anywhere in the
    // app — and an out-of-range page answers 200 with an empty collection.
    it("answers an out-of-range page with empty data and meta", async () => {
      const response = await get(api("/albums"), {
        token: tokenFor("owner"),
        query: { page: 99 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await get(api("/albums"));
      expect(response.status).toBe(401);
    });

    // Top level only, newest first, and id DESC on a created_at tie (7 and 2).
    // A plain level listing carries no ancestors key at all.
    it("lists top-level folders only, newest first, id DESC on a tie", async () => {
      const response = await get(api("/albums"), { token: tokenFor("owner") });
      expect(idsOf(response)).toEqual(["7", "2", "1"]);
      const rows = (response.body as { data: { attributes: Record<string, unknown> }[] }).data;
      expect(rows.every((row) => !("ancestors" in row.attributes))).toBe(true);
    });

    it("lists one level with ?parent_id=", async () => {
      const response = await get(api("/albums"), { token: tokenFor("owner"), query: { parent_id: 1 } });
      expect(idsOf(response)).toEqual(["4"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's ?parent_id=", async () => {
      const response = await get(api("/albums"), { token: tokenFor("owner"), query: { parent_id: 3 } });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // A search spans the whole forest and gives every hit its path.
    it("searches every level with ?q=, each hit carrying its ancestors", async () => {
      const response = await get(api("/albums"), { token: tokenFor("owner"), query: { q: "album" } });
      expect(idsOf(response)).toEqual(["6", "5", "4", "7", "2", "1"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("ignores ?parent_id= under ?q=", async () => {
      const response = await get(api("/albums"), {
        token: tokenFor("owner"),
        query: { q: "delta", parent_id: 2 },
      });
      expect(idsOf(response)).toEqual(["5"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("removes a folder and its descendants from ?q= with ?exclude_subtree=", async () => {
      const response = await get(api("/albums"), {
        token: tokenFor("owner"),
        query: { q: "album", exclude_subtree: 1 },
      });
      expect(idsOf(response)).toEqual(["6", "7", "2"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's ?exclude_subtree=", async () => {
      const response = await get(api("/albums"), {
        token: tokenFor("owner"),
        query: { q: "album", exclude_subtree: 3 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("GET /api/v1/albums/:id", () => {
    it("returns an owned album", async () => {
      const response = await get(api("/albums/1"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // AlbumsController overrides #resource to scope through #resources, so a
    // stranger's album is not found rather than forbidden. Images behave the
    // opposite way — see images.test.ts — and both are contract.
    it("answers 404 for another user's album", async () => {
      const response = await get(api("/albums/3"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an album that does not exist", async () => {
      const response = await get(api("/albums/9999"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Any depth, not only the top level, with the trail root first and without
    // the folder itself.
    it("returns a nested folder with its ancestors, root first", async () => {
      const response = await get(api("/albums/5"), { token: tokenFor("owner") });
      const attributes = (response.body as { data: { attributes: { ancestors: unknown } } }).data.attributes;
      expect(attributes.ancestors).toEqual([
        { id: 1, name: "Alpha Album" },
        { id: 4, name: "Gamma Album" },
      ]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("POST /api/v1/albums", () => {
    it("creates an album", async () => {
      const response = await post(api("/albums"), {
        token: tokenFor("owner"),
        json: { album: { name: "Created Album", description: "made by the suite" } },
      });
      // 200, not 201 — BaseApi#create renders without an explicit status.
      expect(snapshotOf(response, { redactIds: true })).toMatchSnapshot();
    });

    it("rejects a blank name", async () => {
      const response = await post(api("/albums"), {
        token: tokenFor("owner"),
        json: { album: { name: "" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a name over 50 characters", async () => {
      const response = await post(api("/albums"), {
        token: tokenFor("owner"),
        json: { album: { name: "x".repeat(51) } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("creates a folder under one of the user's own folders", async () => {
      const response = await post(api("/albums"), {
        token: tokenFor("owner"),
        json: { album: { name: "Created Child", parent_id: 1 } },
      });
      expect(snapshotOf(response, { redactIds: true })).toMatchSnapshot();
    });

    it("answers 404 for a parent that belongs to another user", async () => {
      const response = await post(api("/albums"), {
        token: tokenFor("owner"),
        json: { album: { name: "Planted", parent_id: 3 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a description over 500 characters", async () => {
      const response = await post(api("/albums"), {
        token: tokenFor("owner"),
        json: { album: { name: "Valid", description: "x".repeat(501) } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("PATCH /api/v1/albums/:id", () => {
    it("updates an owned album", async () => {
      const response = await patch(api("/albums/1"), {
        token: tokenFor("owner"),
        json: { album: { name: "Renamed Album" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's album", async () => {
      const response = await patch(api("/albums/3"), {
        token: tokenFor("owner"),
        json: { album: { name: "Hijacked" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects an invalid update", async () => {
      const response = await patch(api("/albums/1"), {
        token: tokenFor("owner"),
        json: { album: { name: "" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("moves a folder under another of the user's folders", async () => {
      const response = await patch(api("/albums/7"), {
        token: tokenFor("owner"),
        json: { album: { parent_id: 2 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // An omitted parent_id leaves the folder where it is; an explicit null
    // moves it to the top level.
    it("moves a folder to the top level with an explicit null parent_id", async () => {
      const response = await patch(api("/albums/4"), {
        token: tokenFor("owner"),
        json: { album: { parent_id: null } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for a new parent that belongs to another user", async () => {
      const response = await patch(api("/albums/7"), {
        token: tokenFor("owner"),
        json: { album: { parent_id: 3 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a move into the folder's own descendant", async () => {
      const response = await patch(api("/albums/1"), {
        token: tokenFor("owner"),
        json: { album: { parent_id: 5 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a move into the folder itself", async () => {
      const response = await patch(api("/albums/1"), {
        token: tokenFor("owner"),
        json: { album: { parent_id: 1 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("DELETE /api/v1/albums/:id", () => {
    // Images::AlbumDestroy short-circuits when the whole subtree has no images,
    // so this path never touches S3. Album 2 has an empty subfolder (6), which
    // goes with it. Deleting album 1, whose subtree has images, does reach S3 —
    // that lives in the live tier.
    it("destroys a folder and its empty subfolders without touching S3", async () => {
      const response = await del(api("/albums/2"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();

      const child = await get(api("/albums/6"), { token: tokenFor("owner") });
      expect(child.status).toBe(404);
    });

    it("answers 404 for another user's album", async () => {
      const response = await del(api("/albums/3"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await del(api("/albums/2"));
      expect(response.status).toBe(401);
    });
  });
});
