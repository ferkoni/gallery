import { beforeAll, describe, expect, it } from "vitest";
import { del, get, post, put } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";
import { liveS3, liveS3Credentials } from "../src/support/config.js";

// The four paths that genuinely reach AWS. Skipped unless CONTRACT_LIVE_S3=1
// and real credentials for a throwaway bucket are in the environment.
//
// Everything reachable *before* these endpoints call S3 — missing credentials,
// disallowed content type, oversized file, non-owner, no token — is covered in
// the default tier, so this tier only adds the happy paths.
//
// Note these snapshots are recorded against a different bucket and region than
// the seeded fixtures, so they live in their own file and never mix with the
// default tier's.
const GIF_BYTES = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

describe.skipIf(!liveS3)("live S3 tier", () => {
  beforeAll(() => {
    const missing = Object.entries(liveS3Credentials)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(`CONTRACT_LIVE_S3=1 but these are unset: ${missing.join(", ")}`);
    }
  });

  describe("PUT /api/s3_credentials", () => {
    beforeAll(async () => {
      await resetData();
    });

    it("accepts credentials that can reach the bucket", async () => {
      const response = await put("/api/s3_credentials", {
        token: tokenFor("owner"),
        json: {
          s3_credential: {
            access_key_id: liveS3Credentials.accessKeyId,
            secret_access_key: liveS3Credentials.secretAccessKey,
            region: liveS3Credentials.region,
            bucket: liveS3Credentials.bucket,
          },
        },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects credentials that cannot reach the bucket", async () => {
      const response = await put("/api/s3_credentials", {
        token: tokenFor("owner"),
        json: {
          s3_credential: {
            access_key_id: "AKIAIOSFODNN7EXAMPLE",
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            region: liveS3Credentials.region,
            bucket: liveS3Credentials.bucket,
          },
        },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("image upload and delete", () => {
    beforeAll(async () => {
      await resetData();
      const response = await put("/api/s3_credentials", {
        token: tokenFor("owner"),
        json: {
          s3_credential: {
            access_key_id: liveS3Credentials.accessKeyId,
            secret_access_key: liveS3Credentials.secretAccessKey,
            region: liveS3Credentials.region,
            bucket: liveS3Credentials.bucket,
          },
        },
      });
      if (response.status !== 204) {
        throw new Error(`could not store live credentials: ${response.status} ${response.text}`);
      }
    });

    let uploadedId: string;

    it("uploads an image and answers 201", async () => {
      const form = new FormData();
      form.set("image[file]", new Blob([new Uint8Array(GIF_BYTES)], { type: "image/gif" }), "tiny.gif");
      form.set("image[album_id]", "1");
      form.set("image[title]", "Uploaded By Contract Suite");

      const response = await post("/api/images", { token: tokenFor("owner"), form });
      // 201 here, where album and user create answer 200 — ImagesController
      // sets the status explicitly and BaseApi#create does not.
      expect(snapshotOf(response, { redactIds: true })).toMatchSnapshot();
      uploadedId = (response.body as { data: { id: string } }).data.id;
    });

    it("defaults the title to the filename without its extension", async () => {
      const form = new FormData();
      form.set("image[file]", new Blob([new Uint8Array(GIF_BYTES)], { type: "image/gif" }), "untitled-photo.gif");
      form.set("image[album_id]", "1");

      const response = await post("/api/images", { token: tokenFor("owner"), form });
      const body = response.body as { data: { attributes: { title: string } } };
      expect(body.data.attributes.title).toBe("untitled-photo");
    });

    it("deletes the uploaded image", async () => {
      const response = await del(`/api/images/${uploadedId}`, { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("DELETE /api/albums/:id with images", () => {
    beforeAll(async () => {
      await resetData();
      await put("/api/s3_credentials", {
        token: tokenFor("owner"),
        json: {
          s3_credential: {
            access_key_id: liveS3Credentials.accessKeyId,
            secret_access_key: liveS3Credentials.secretAccessKey,
            region: liveS3Credentials.region,
            bucket: liveS3Credentials.bucket,
          },
        },
      });
    });

    // The seeded images point at keys that do not exist in the live bucket.
    // S3 delete_objects is idempotent — deleting a missing key is not an error —
    // so this exercises the batch-delete path without needing real objects.
    it("batch-deletes the album's objects and destroys the album", async () => {
      const response = await del("/api/albums/1", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  describe("POST /api/async_tasks — album download", () => {
    beforeAll(async () => {
      await resetData();
      await put("/api/s3_credentials", {
        token: tokenFor("owner"),
        json: {
          s3_credential: {
            access_key_id: liveS3Credentials.accessKeyId,
            secret_access_key: liveS3Credentials.secretAccessKey,
            region: liveS3Credentials.region,
            bucket: liveS3Credentials.bucket,
          },
        },
      });
    });

    // Only the enqueue is asserted. Whether the job then succeeds depends on
    // the seeded keys existing in the bucket, which they do not — the job's own
    // behaviour is out of scope for an HTTP contract suite.
    it("creates the task and answers 201 with its id", async () => {
      const response = await post("/api/async_tasks", {
        token: tokenFor("owner"),
        json: { async_task: { task_type: "album_download", payload: { album_id: 1 } } },
      });
      expect(snapshotOf(response, { redactIds: true })).toMatchSnapshot();
    });

    it("exposes the created task on the index", async () => {
      const response = await get("/api/async_tasks", { token: tokenFor("owner") });
      expect(response.status).toBe(200);
      const body = response.body as { data: unknown[] };
      expect(body.data.length).toBeGreaterThan(0);
    });
  });
});
