import { beforeAll, describe, expect, it } from "vitest";
import { api, del, post } from "../src/support/http.js";
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

  // There is no signup: accounts come from a CLI (#60). Status only — a routing
  // error's body in development is Rails' debug output, which no Node backend
  // should reproduce.
  describe("POST /api/v1/users", () => {
    it("answers 404, because there is no signup endpoint", async () => {
      const response = await post(api("/users"), {
        json: { user: { email: "fresh@contract.test", password: PASSWORD, password_confirmation: PASSWORD } },
      });
      expect(response.status).toBe(404);
    });
  });

  // Minted by the successful-login test below and consumed by logout. Kept
  // in-file on purpose: logging out rotates the user's jti, so this must never
  // touch a token another suite depends on.
  let authfixtureToken: string;

  describe("POST /api/v1/users/login", () => {
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

  describe("DELETE /api/v1/users/logout", () => {
    it("requires a token", async () => {
      const response = await del(api("/users/logout"));
      expect(response.status).toBe(401);
    });

    it("answers 204 for an authenticated user", async () => {
      const response = await del(api("/users/logout"), { token: authfixtureToken });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // Logout rotates jti, so the token it was called with stops working. This
    // is deliberate in the Rails app and parity must preserve it.
    it("invalidates the token it was called with", async () => {
      const response = await del(api("/users/logout"), { token: authfixtureToken });
      expect(response.status).toBe(401);
    });
  });
});
