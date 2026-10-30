import { beforeEach, describe, expect, it } from "vitest";
import { api, del, get, patch, post } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { readImageRow, resetData } from "../src/support/db.js";
import { idsOf, snapshotOf } from "../src/support/normalise.js";

// A 1x1 GIF. Small enough to send on every call, and a real image/gif so it
// clears Images::Upload's ALLOWED_TYPES check.
const GIF_BYTES = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function imageForm(fields: {
  file?: { bytes: Buffer; name: string; type: string };
  title?: string;
  album_id?: number | string;
}): FormData {
  const form = new FormData();
  if (fields.file) {
    form.set(
      "image[file]",
      new Blob([new Uint8Array(fields.file.bytes)], { type: fields.file.type }),
      fields.file.name,
    );
  }
  if (fields.title !== undefined) form.set("image[title]", fields.title);
  if (fields.album_id !== undefined) form.set("image[album_id]", String(fields.album_id));
  return form;
}

describe("images", () => {
  beforeEach(async () => {
    await resetData();
  });

  describe("GET /api/v1/images", () => {
    // The url attribute is a presigned URL. Presigning is a local crypto
    // operation — no S3 call is made — so this works against seeded fake
    // credentials. The normaliser redacts the signature and its inputs but
    // keeps the host and path, so the s3_key is still asserted.
    it("returns the current user's images newest first, with presigned urls", async () => {
      const response = await get(api("/images"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Every photo action presigns, so without credentials it answers what
    // upload and delete already answer for the same state (require_storage!,
    // #58). Before #58 this was a 200 with null urls.
    it("answers 422 for a user with no S3 credentials", async () => {
      const response = await get(api("/images"), { token: tokenFor("nocreds") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // "Search in this folder": the folder and everything under it. Image 4 is
    // two levels below album 1.
    it("spans the folder's subtree with album_id", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { album_id: 1 },
      });
      expect(idsOf(response)).toEqual(["4", "5", "2", "1"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("narrows album_id to the folder itself with album_scope=direct", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { album_id: 1, album_scope: "direct" },
      });
      expect(idsOf(response)).toEqual(["5", "2", "1"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's album_id", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { album_id: 3 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // ?q= returns results in the search ranking (#46). With inference off the
    // ranking is lexical, and lexical ranks newest first: Images::Search's
    // lexical_ids appends .order(:id) after the index's created_at DESC, id DESC
    // rather than replacing it. Its comment intends id order (2 before 5). A
    // frozen quirk, owner's decision 2026-10-30; logged in bugs.md, to be fixed
    // after the migration.
    it("returns lexical ?q= results newest first, as Rails ranks them", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { q: "harbour" },
      });
      expect(idsOf(response)).toEqual(["5", "2"]);
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The grid's thumbnail. An image without one (1, 2: they predate
    // thumbnails) falls back to the original; one with a thumbnail (4, 5)
    // points at <name>.thumb.webp.
    it("gives every image a thumbnail_url, falling back to the original", async () => {
      const response = await get(api("/images"), { token: tokenFor("owner") });
      const rows = (response.body as { data: { id: string; attributes: { url: string; thumbnail_url: string } }[] }).data;
      const paths = Object.fromEntries(
        rows.map((row) => [
          row.id,
          { url: new URL(row.attributes.url).pathname, thumb: new URL(row.attributes.thumbnail_url).pathname },
        ]),
      );
      expect(paths["1"]!.thumb).toBe(paths["1"]!.url);
      expect(paths["4"]!.thumb).toBe("/images/44444444-4444-4444-8444-444444444444/lighthouse.thumb.webp");
      expect(paths["4"]!.url).toBe("/images/44444444-4444-4444-8444-444444444444/lighthouse.jpg");
    });

    it("filters favorites", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { favorited: "true" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("searches titles case-insensitively with q", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { q: "sunrise" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("searches tags with q", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { q: "morning" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by title", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { title: "harbour" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by exact tag", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { tag: "landscape" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by from date", async () => {
      const response = await get(api("/images"), {
        token: tokenFor("owner"),
        query: { from: "2026-02-02" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await get(api("/images"));
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/v1/images/:id", () => {
    it("returns an owned image", async () => {
      const response = await get(api("/images/1"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Images use BaseApi#resource, which finds unscoped and then lets Pundit
    // reject — so this is 403 Forbidden, where the equivalent album request is
    // 404 Not found. The asymmetry is contract.
    it("answers 403 for another user's image", async () => {
      const response = await get(api("/images/3"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an image that does not exist", async () => {
      const response = await get(api("/images/9999"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 422 for the user's own image without S3 credentials", async () => {
      const response = await get(api("/images/6"), { token: tokenFor("nocreds") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Authorisation runs before the credentials check, so someone else's
    // photo is a 403 whatever the caller's credentials.
    it("answers 403 for another user's image even without S3 credentials", async () => {
      const response = await get(api("/images/3"), { token: tokenFor("nocreds") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("PATCH /api/v1/images/:id", () => {
    it("updates metadata without touching S3", async () => {
      const response = await patch(api("/images/1"), {
        token: tokenFor("owner"),
        json: { image: { title: "Renamed", description: "edited", favorited: false } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("replaces tags", async () => {
      const response = await patch(api("/images/1"), {
        token: tokenFor("owner"),
        json: { image: { tags: ["dawn", "sea"] } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a tag over 25 characters", async () => {
      const response = await patch(api("/images/1"), {
        token: tokenFor("owner"),
        json: { image: { tags: ["x".repeat(26)] } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("moves an image between the user's own albums", async () => {
      const response = await patch(api("/images/1"), {
        token: tokenFor("owner"),
        json: { image: { album_id: 2 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The cross-user album guard: Album.with_user(current_user).find raises
    // RecordNotFound, so this is 404 even though the image itself is owned.
    it("answers 404 when moving an image into another user's album", async () => {
      const response = await patch(api("/images/1"), {
        token: tokenFor("owner"),
        json: { image: { album_id: 3 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 403 for another user's image", async () => {
      const response = await patch(api("/images/3"), {
        token: tokenFor("owner"),
        json: { image: { title: "Hijacked" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Refused before the save, so nothing is written.
    it("answers 422 without S3 credentials and writes nothing", async () => {
      const response = await patch(api("/images/6"), {
        token: tokenFor("nocreds"),
        json: { image: { title: "Changed", favorited: true } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
      expect(await readImageRow(6)).toMatchObject({ title: "Unsigned", favorited: false });
    });
  });

  // Many photos into one folder, all or nothing (#55). Ids and album_id are
  // top-level JSON keys.
  describe("PATCH /api/v1/images/move", () => {
    it("answers 204 and moves every photo", async () => {
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids: [1, 5], album_id: 2 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();

      const moved = await get(api("/albums/2/images"), { token: tokenFor("owner") });
      expect(idsOf(moved)).toEqual(["5", "1"]);
    });

    // A batch cannot say which id failed without confirming the others exist.
    it("answers 404 and moves nothing if any photo is not the user's", async () => {
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids: [1, 3], album_id: 2 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();

      const unmoved = await get(api("/albums/1/images"), { token: tokenFor("owner") });
      expect(idsOf(unmoved)).toEqual(["5", "2", "1"]);
    });

    it("answers 404 and moves nothing if a photo does not exist", async () => {
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids: [1, 9999], album_id: 2 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();

      const unmoved = await get(api("/albums/1/images"), { token: tokenFor("owner") });
      expect(idsOf(unmoved)).toEqual(["5", "2", "1"]);
    });

    it("answers 404 for a folder that is not the user's", async () => {
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids: [1], album_id: 3 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for a missing album_id", async () => {
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids: [1] },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 422 for an empty list", async () => {
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids: [], album_id: 2 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // MAX_IDS is 500. The list is refused before any id is looked up.
    it("answers 422 for 501 ids", async () => {
      const ids = Array.from({ length: 501 }, (_, index) => index + 1);
      const response = await patch(api("/images/move"), {
        token: tokenFor("owner"),
        json: { ids, album_id: 2 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await patch(api("/images/move"), { json: { ids: [1], album_id: 2 } });
      expect(response.status).toBe(401);
    });
  });

  // Everything below rejects before Images::Upload reaches S3, so it belongs in
  // the default tier. The successful upload is in the live tier.
  describe("POST /api/v1/images — rejections that never reach S3", () => {
    it("answers 422 when the user has no S3 credentials", async () => {
      const response = await post(api("/images"), {
        token: tokenFor("nocreds"),
        form: imageForm({
          file: { bytes: GIF_BYTES, name: "tiny.gif", type: "image/gif" },
          album_id: 8,
        }),
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The twin of the PATCH case above: create and update apply the same guard to the
    // same parameter, so a stranger's album is a 404 from both. Before this existed,
    // POST accepted it and answered 201 — the image was filed into an album its owner
    // could not see and would delete out from under it.
    it("answers 404 when creating an image in another user's album", async () => {
      const response = await post(api("/images"), {
        token: tokenFor("owner"),
        form: imageForm({
          file: { bytes: GIF_BYTES, name: "tiny.gif", type: "image/gif" },
          album_id: 3,
        }),
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a disallowed content type", async () => {
      const response = await post(api("/images"), {
        token: tokenFor("owner"),
        form: imageForm({
          file: { bytes: Buffer.from("not an image"), name: "notes.txt", type: "text/plain" },
          album_id: 1,
        }),
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a file over the 25 MB limit", async () => {
      const oversized = Buffer.alloc(25 * 1024 * 1024 + 1, 0);
      const response = await post(api("/images"), {
        token: tokenFor("owner"),
        form: imageForm({
          file: { bytes: oversized, name: "huge.jpg", type: "image/jpeg" },
          album_id: 1,
        }),
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await post(api("/images"), {
        form: imageForm({
          file: { bytes: GIF_BYTES, name: "tiny.gif", type: "image/gif" },
          album_id: 1,
        }),
      });
      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/v1/images/:id — rejections that never reach S3", () => {
    // Pundit runs in a before_action, so authorization fails before
    // Images::Destroy is ever called.
    it("answers 403 for another user's image", async () => {
      const response = await del(api("/images/3"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an image that does not exist", async () => {
      const response = await del(api("/images/9999"), { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await del(api("/images/1"));
      expect(response.status).toBe(401);
    });
  });
});
