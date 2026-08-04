import { baseUrl } from "./support/config.js";
import { resetEverything } from "./support/db.js";
import { mintTokens, resetState } from "./support/auth.js";
import { get, post } from "./support/http.js";
import { PASSWORD, userOrder, users } from "./support/fixtures.js";

// Runs once per suite run, before any test file.
//
// Users are registered here and then left alone for the whole run. Individual
// test files truncate and re-seed only the data tables, so their tokens stay
// valid — which matters, because re-authenticating costs rack-attack budget.
export async function setup(): Promise<void> {
  const health = await get("/health").catch(() => null);
  if (!health) {
    throw new Error(
      `no backend responding at ${baseUrl}. Start the target server first — see contract/README.md.`,
    );
  }

  resetState();
  await resetEverything();

  // Registration is not throttled, so this is free. Order fixes the user ids.
  for (const key of userOrder) {
    const response = await post("/api/users", {
      json: {
        user: {
          email: users[key].email,
          password: PASSWORD,
          password_confirmation: PASSWORD,
        },
      },
    });
    if (response.status >= 400) {
      throw new Error(`could not register ${users[key].email}: ${response.status} ${response.text}`);
    }
  }

  await mintTokens();
}
