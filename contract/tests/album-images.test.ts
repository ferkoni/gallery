import { beforeEach, describe, expect, it } from "vitest";
import { api, get } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { idsOf, snapshotOf } from "../src/support/normalise.js";

// The nested index: "what is in this folder", exactly, with no subfolders. The
// flat /images?album_id= spans the subtree instead (images.test.ts). Its
// ownership guard is Album.with_user(...).find, so a stranger's album answers
// 404 — not the 403 the flat images index gives for a stranger's image.
describe("GET /api/v1/albums/:album_id/images", () => {
  beforeEach(async () => {
    await resetData();
  });

  // Image 4 is in a subfolder of album 1, so it is not listed here.
  it("returns the album's own images with meta, not its subfolders'", async () => {
    const response = await get(api("/albums/1/images"), { token: tokenFor("owner") });
    expect(idsOf(response)).toEqual(["5", "2", "1"]);
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("returns an empty collection for a folder whose images are all in a subfolder", async () => {
    const response = await get(api("/albums/4/images"), { token: tokenFor("owner") });
    expect(idsOf(response)).toEqual([]);
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("returns an empty collection for an album with no images", async () => {
    const response = await get(api("/albums/2/images"), { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("answers 404 for another user's album rather than leaking its images", async () => {
    const response = await get(api("/albums/3/images"), { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("answers 404 for an album that does not exist", async () => {
    const response = await get(api("/albums/9999/images"), { token: tokenFor("owner") });
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("requires a token", async () => {
    const response = await get(api("/albums/1/images"));
    expect(response.status).toBe(401);
  });
});
