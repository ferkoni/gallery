import crypto from "node:crypto";
import { jwtSecret } from "./config.js";

// Signs an HS256 token with the claims devise-jwt puts in a user's token. Only
// for tests that need a token the backend did not mint, such as an expired one.
export function signUserToken(claims: { sub: string; jti: string; iat: number; exp: number }): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256" });
  const payload = encode({ ...claims, scp: "user", aud: null });
  const signature = crypto.createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
