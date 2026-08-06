import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stateFile } from "./config.js";
import { post } from "./http.js";
import { PASSWORD, users, type UserKey } from "./fixtures.js";

// rack-attack throttles POST /api/users/login at 5 per IP per 60s and 10 per
// email per 60s (gallery-api/config/initializers/rack_attack.rb). The
// middleware is mounted unconditionally in config/application.rb and dev's
// cache_store is :memory_store, so the throttle is live in development — a
// suite that authenticates per test collects 429s within seconds and records
// garbage into the snapshots.
//
// Two consequences the suite is built around:
//   1. Tokens are minted once in global setup and reused everywhere. Users are
//      never truncated between test files, only the data tables.
//   2. Every login goes through login() below, which paces calls so the limit
//      is never crossed. A normal run uses exactly 5: three in setup, two in
//      tests/users.test.ts.
//
// Logging in also rotates users.jti, invalidating that user's other tokens, so
// tests that exercise login use `authfixture` and nothing else does.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 60_000;
const SAFETY_MARGIN_MS = 1_000;

interface State {
  tokens: Partial<Record<UserKey, string>>;
  loginAttempts: number[];
}

function readState(): State {
  if (!existsSync(stateFile)) return { tokens: {}, loginAttempts: [] };
  return JSON.parse(readFileSync(stateFile, "utf8")) as State;
}

function writeState(state: State): void {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export function resetState(): void {
  writeState({ tokens: {}, loginAttempts: [] });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function awaitLoginSlot(): Promise<void> {
  for (;;) {
    const state = readState();
    const cutoff = Date.now() - LOGIN_WINDOW_MS;
    const recent = state.loginAttempts.filter((at) => at > cutoff);

    if (recent.length < LOGIN_LIMIT) {
      recent.push(Date.now());
      writeState({ ...state, loginAttempts: recent });
      return;
    }

    const oldest = Math.min(...recent);
    const wait = oldest + LOGIN_WINDOW_MS - Date.now() + SAFETY_MARGIN_MS;
    console.warn(
      `[contract] rack-attack login budget exhausted; waiting ${Math.ceil(wait / 1000)}s. ` +
        "This normally only happens when the suite is re-run inside 60 seconds.",
    );
    await sleep(Math.max(wait, SAFETY_MARGIN_MS));
  }
}

// The only way the suite should ever POST to /api/users/login.
export async function login(email: string, password: string) {
  await awaitLoginSlot();
  return post("/api/users/login", { json: { user: { email, password } } });
}

export async function mintTokens(): Promise<void> {
  const state = readState();
  const tokens: Partial<Record<UserKey, string>> = {};

  // authfixture is deliberately excluded — tests/users.test.ts logs in as that
  // user itself, and jti rotation would invalidate a token minted here.
  for (const key of ["owner", "stranger", "nocreds"] as const) {
    const response = await login(users[key].email, PASSWORD);
    if (response.status !== 200) {
      throw new Error(
        `could not authenticate ${users[key].email}: ${response.status} ${response.text}`,
      );
    }
    tokens[key] = (response.body as { token: string }).token;
  }

  writeState({ ...readState(), tokens: { ...state.tokens, ...tokens } });
}

export function tokenFor(key: Exclude<UserKey, "authfixture">): string {
  const token = readState().tokens[key];
  if (!token) throw new Error(`no token for ${key}; global setup did not run`);
  return token;
}
