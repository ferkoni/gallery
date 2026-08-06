import { beforeEach, describe, expect, it } from "vitest";
import { del, get, patch, post } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";

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

  describe("GET /api/images", () => {
    // The url attribute is a presigned URL. Presigning is a local crypto
    // operation — no S3 call is made — so this works against seeded fake
    // credentials. The normaliser redacts the signature and its inputs but
    // keeps the host and path, so the s3_key is still asserted.
    it("returns the current user's images newest first, with presigned urls", async () => {
      const response = await get("/api/images", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("returns a null url for a user with no S3 credentials", async () => {
      const response = await get("/api/images", { token: tokenFor("nocreds") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by album_id", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { album_id: 1 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters favorites", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { favorited: "true" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("searches titles case-insensitively with q", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { q: "sunrise" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("searches tags with q", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { q: "morning" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by title", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { title: "harbour" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by exact tag", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { tag: "landscape" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("filters by from date", async () => {
      const response = await get("/api/images", {
        token: tokenFor("owner"),
        query: { from: "2026-02-02" },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await get("/api/images");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/images/:id", () => {
    it("returns an owned image", async () => {
      const response = await get("/api/images/1", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Images use BaseApi#resource, which finds unscoped and then lets Pundit
    // reject — so this is 403 Forbidden, where the equivalent album request is
    // 404 Not found. The asymmetry is contract.
    it("answers 403 for another user's image", async () => {
      const response = await get("/api/images/3", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an image that does not exist", async () => {
      const response = await get("/api/images/9999", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("PATCH /api/images/:id", () => {
    it("updates metadata without touching S3", async () => {
      const response = await patch("/api/images/1", {
        token: tokenFor("owner"),
        json: { image: { title: "Renamed", description: "edited", favorited: false } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("replaces tags", async () => {
      const response = await patch("/api/images/1", {
        token: tokenFor("owner"),
        json: { image: { tags: ["dawn", "sea"] } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a tag over 25 characters", async () => {
      const response = await patch("/api/images/1", {
        token: tokenFor("owner"),
        json: { image: { tags: ["x".repeat(26)] } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("moves an image between the user's own albums", async () => {
      const response = await patch("/api/images/1", {
        token: tokenFor("owner"),
        json: { image: { album_id: 2 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The cross-user album guard: Album.with_user(current_user).find raises
    // RecordNotFound, so this is 404 even though the image itself is owned.
    it("answers 404 when moving an image into another user's album", async () => {
      const response = await patch("/api/images/1", {
        token: tokenFor("owner"),
        json: { image: { album_id: 3 } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 403 for another user's image", async () => {
      const response = await patch("/api/images/3", {
        token: tokenFor("owner"),
        json: { image: { title: "Hijacked" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  // Everything below rejects before Images::Upload reaches S3, so it belongs in
  // the default tier. The successful upload is in the live tier.
  describe("POST /api/images — rejections that never reach S3", () => {
    it("answers 422 when the user has no S3 credentials", async () => {
      const response = await post("/api/images", {
        token: tokenFor("nocreds"),
        form: imageForm({
          file: { bytes: GIF_BYTES, name: "tiny.gif", type: "image/gif" },
          album_id: 1,
        }),
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a disallowed content type", async () => {
      const response = await post("/api/images", {
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
      const response = await post("/api/images", {
        token: tokenFor("owner"),
        form: imageForm({
          file: { bytes: oversized, name: "huge.jpg", type: "image/jpeg" },
          album_id: 1,
        }),
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await post("/api/images", {
        form: imageForm({
          file: { bytes: GIF_BYTES, name: "tiny.gif", type: "image/gif" },
          album_id: 1,
        }),
      });
      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/images/:id — rejections that never reach S3", () => {
    // Pundit runs in a before_action, so authorization fails before
    // Images::Destroy is ever called.
    it("answers 403 for another user's image", async () => {
      const response = await del("/api/images/3", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an image that does not exist", async () => {
      const response = await del("/api/images/9999", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await del("/api/images/1");
      expect(response.status).toBe(401);
    });
  });
});
