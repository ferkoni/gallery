import { baseUrl } from "./support/config.js";
import { resetEverything } from "./support/db.js";
import { mintTokens, resetState } from "./support/auth.js";
import { get } from "./support/http.js";

// Runs once per suite run, before any test file.
//
// Users are inserted here, with pinned ids, and then left alone for the whole
// run. Individual test files truncate and re-seed only the data tables, so their
// tokens stay valid — which matters, because re-authenticating costs rack-attack
// budget.
export async function setup(): Promise<void> {
  const health = await get("/health").catch(() => null);
  if (!health) {
    throw new Error(
      `no backend responding at ${baseUrl}. Start the target server first — see contract/README.md.`,
    );
  }

  resetState();
  await resetEverything();
  await mintTokens();
}
