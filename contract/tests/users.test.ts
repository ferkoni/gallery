import { beforeAll, describe, expect, it } from "vitest";
import { del, post } from "../src/support/http.js";
import { login } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";
import { PASSWORD, users } from "../src/support/fixtures.js";

// This file owns the two remaining logins in rack-attack's per-run budget, and
// it spends them on `authfixture` so that rotating that user's jti cannot
// invalidate any token the other suites rely on.
describe("users", () => {
  beforeAll(async () => {
    await resetData();
  });

  describe("POST /api/users", () => {
    it("registers a user", async () => {
      const response = await post("/api/users", {
        json: {
          user: {
            email: "fresh@contract.test",
            password: PASSWORD,
            password_confirmation: PASSWORD,
          },
        },
      });
      // Note the status: BaseApi#create renders without an explicit status, so
      // registration answers 200, not 201.
      expect(snapshotOf(response, { redactIds: true })).toMatchSnapshot();
    });

    it("rejects a duplicate email", async () => {
      const response = await post("/api/users", {
        json: {
          user: {
            email: users.owner.email,
            password: PASSWORD,
            password_confirmation: PASSWORD,
          },
        },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a mismatched password confirmation", async () => {
      const response = await post("/api/users", {
        json: {
          user: {
            email: "mismatch@contract.test",
            password: PASSWORD,
            password_confirmation: "something-else",
          },
        },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects a blank email", async () => {
      const response = await post("/api/users", {
        json: { user: { email: "", password: PASSWORD, password_confirmation: PASSWORD } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  // Minted by the successful-login test below and consumed by logout. Kept
  // in-file on purpose: logging out rotates the user's jti, so this must never
  // touch a token another suite depends on.
  let authfixtureToken: string;

  describe("POST /api/users/login", () => {
    // The error shape here is an array — `{errors: ["Invalid email or password"]}` —
    // where BaseApi's rescues emit a bare string and validation failures emit an
    // object. All three shapes are contract.
    it("rejects a wrong password", async () => {
      const response = await login(users.authfixture.email, "not-the-password");
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("returns a token and the serialized user", async () => {
      const response = await login(users.authfixture.email, PASSWORD);
      expect(snapshotOf(response)).toMatchSnapshot();
      authfixtureToken = (response.body as { token: string }).token;
    });
  });

  describe("DELETE /api/users/logout", () => {
    it("requires a token", async () => {
      const response = await del("/api/users/logout");
      expect(response.status).toBe(401);
    });

    it("answers 204 for an authenticated user", async () => {
      const response = await del("/api/users/logout", { token: authfixtureToken });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Logout rotates jti, so the token it was called with stops working. This
    // is deliberate in the Rails app and parity must preserve it.
    it("invalidates the token it was called with", async () => {
      const response = await del("/api/users/logout", { token: authfixtureToken });
      expect(response.status).toBe(401);
    });
  });
});
