import { beforeEach, describe, expect, it } from "vitest";
import { del, get, patch, post } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";

// Album 1 belongs to owner and has images; album 2 belongs to owner and is
// empty; album 3 belongs to stranger.
describe("albums", () => {
  beforeEach(async () => {
    await resetData();
  });

  describe("GET /api/albums", () => {
    it("returns the current user's albums with Kaminari meta", async () => {
      const response = await get("/api/albums", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("never leaks another user's albums", async () => {
      const response = await get("/api/albums", { token: tokenFor("stranger") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The default page size is Kaminari's 25 — no paginates_per anywhere in the
    // app — and an out-of-range page answers 200 with an empty collection.
    it("answers an out-of-range page with empty data and meta", async () => {
      const response = await get("/api/albums", {
        token: tokenFor("owner"),
        query: { page: 99 },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await get("/api/albums");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/albums/:id", () => {
    it("returns an owned album", async () => {
      const response = await get("/api/albums/1", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // AlbumsController overrides #resource to scope through #resources, so a
    // stranger's album is not found rather than forbidden. Images behave the
    // opposite way — see images.test.ts — and both are contract.
    it("answers 404 for another user's album", async () => {
      const response = await get("/api/albums/3", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an album that does not exist", async () => {
      const response = await get("/api/albums/9999", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("POST /api/albums", () => {
    it("creates an album", async () => {
      const response = await post("/api/albums", {
        token: tokenFor("owner"),
        json: { album: { name: "Created Album", description: "made by the suite" } },
      });
      // 200, not 201 — BaseApi#create renders without an explicit status.
      expect(snapshotOf(response, { redactIds: true })).toMatchSnapshot();
    });

    it("rejects a blank name", async () => {
      const response = await post("/api/albums", {
        token: tokenFor("owner"),
        json: { album: { name: "" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a name over 50 characters", async () => {
      const response = await post("/api/albums", {
        token: tokenFor("owner"),
        json: { album: { name: "x".repeat(51) } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a description over 500 characters", async () => {
      const response = await post("/api/albums", {
        token: tokenFor("owner"),
        json: { album: { name: "Valid", description: "x".repeat(501) } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("PATCH /api/albums/:id", () => {
    it("updates an owned album", async () => {
      const response = await patch("/api/albums/1", {
        token: tokenFor("owner"),
        json: { album: { name: "Renamed Album" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's album", async () => {
      const response = await patch("/api/albums/3", {
        token: tokenFor("owner"),
        json: { album: { name: "Hijacked" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects an invalid update", async () => {
      const response = await patch("/api/albums/1", {
        token: tokenFor("owner"),
        json: { album: { name: "" } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("DELETE /api/albums/:id", () => {
    // Images::AlbumDestroy short-circuits when the album has no images, so this
    // path never touches S3. Deleting album 1, which has images, does — that
    // lives in the live tier.
    it("destroys an empty album without touching S3", async () => {
      const response = await del("/api/albums/2", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's album", async () => {
      const response = await del("/api/albums/3", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await del("/api/albums/2");
      expect(response.status).toBe(401);
    });
  });
});
