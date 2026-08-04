import { beforeEach, describe, expect, it } from "vitest";
import { get } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";

// The nested index. Its ownership guard is Album.with_user(...).find, so a
// stranger's album answers 404 — not the 403 the flat images index gives for a
// stranger's image.
describe("GET /api/albums/:album_id/images", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("returns the album's images with meta", async () => {
    const response = await get("/api/albums/1/images", { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("returns an empty collection for an album with no images", async () => {
    const response = await get("/api/albums/2/images", { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("answers 404 for another user's album rather than leaking its images", async () => {
    const response = await get("/api/albums/3/images", { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("answers 404 for an album that does not exist", async () => {
    const response = await get("/api/albums/9999/images", { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("requires a token", async () => {
    const response = await get("/api/albums/1/images");
    expect(response.status).toBe(401);
  });
});
