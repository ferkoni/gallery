import { beforeEach, describe, expect, it } from "vitest";
import { del, get, put } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { readRawCredentialColumns, resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";
import { s3Credentials, users } from "../src/support/fixtures.js";

describe("s3_credentials", () => {
  beforeEach(async () => {
    await resetData();
  });

  // PUT is absent from the default tier: S3::Storage#reachable? runs
  // head_bucket + put_object + delete_object on every call, so there is no
  // successful path that does not reach AWS. It lives in tests/live-s3.test.ts.
  describe("PUT /api/s3_credentials", () => {
    it("requires a token", async () => {
      const response = await put("/api/s3_credentials", {
        json: { s3_credential: { access_key_id: "x", secret_access_key: "y", region: "eu-west-1", bucket: "b" } },
      });
      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/s3_credentials", () => {
    // Destroy never touches S3 — it only removes the row.
    it("destroys the current user's credentials", async () => {
      const response = await del("/api/s3_credentials", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 when the user has no credentials on file", async () => {
      const response = await del("/api/s3_credentials", { token: tokenFor("nocreds") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 on a second delete", async () => {
      await del("/api/s3_credentials", { token: tokenFor("owner") });
      const response = await del("/api/s3_credentials", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await del("/api/s3_credentials");
      expect(response.status).toBe(401);
    });
  });

  // Not an endpoint contract — a check on the encryption-at-rest boundary that
  // both backends have to sit behind. The suite seeds these rows by writing
  // ActiveRecord Encryption's envelope directly (support/ar-encryption.ts).
  //
  // If the backend under test can decrypt what the suite wrote, the two agree
  // on the format. That makes this the standing regression test for the
  // decision taken in ticket 03, and the black-box counterpart to
  // spec/models/s3_credential_spec.rb's raw-SQL assertion.
  describe("encryption at rest", () => {
    it("stores an envelope rather than plaintext", async () => {
      const raw = await readRawCredentialColumns(users.owner.id);
      expect(raw).not.toBeNull();

      const seeded = s3Credentials[0]!;
      expect(raw!.access_key_id).not.toBe(seeded.accessKeyId);
      expect(raw!.secret_access_key).not.toBe(seeded.secretAccessKey);

      const envelope = JSON.parse(raw!.access_key_id) as { p: string; h: { iv: string; at: string } };
      expect(typeof envelope.p).toBe("string");
      expect(Buffer.from(envelope.h.iv, "base64")).toHaveLength(12);
      expect(Buffer.from(envelope.h.at, "base64")).toHaveLength(16);
    });

    it("the backend decrypts the seeded credentials, proving format agreement", async () => {
      // The presigned url in the images index is signed with the decrypted
      // access key id, which appears in X-Amz-Credential. If the backend could
      // not decrypt the column, there would be no url at all.
      const response = await get("/api/images", { token: tokenFor("owner") });
      expect(response.status).toBe(200);

      const body = response.body as { data: { attributes: { url: string | null } }[] };
      const url = body.data[0]?.attributes.url;
      expect(url, "expected a presigned url for a user with credentials").toBeTruthy();

      const credential = new URL(url!).searchParams.get("X-Amz-Credential");
      expect(credential).toContain(s3Credentials[0]!.accessKeyId);
      expect(new URL(url!).host).toContain(s3Credentials[0]!.bucket);
    });
  });
});
