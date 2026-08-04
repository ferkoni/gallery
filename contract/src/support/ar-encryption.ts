import crypto from "node:crypto";
import zlib from "node:zlib";
import { encryptionKeys } from "./config.js";

// Writes ActiveRecord Encryption's on-disk envelope so the suite can seed
// s3_credentials rows directly. PUT /api/s3_credentials is unusable for
// seeding: S3::Storage#reachable? does head_bucket + put_object + delete_object
// on every call, so it always reaches AWS.
//
// Format established by the research for ticket 02, cited to activerecord-8.1.3:
// see .scratch/rails-to-node-migration/research/02-ar-encryption-envelope.md
//
//   column value := JSON, stored as plain UTF-8 text with no outer base64
//   {"p":"<b64 ciphertext>","h":{"iv":"<b64 12B>","at":"<b64 16B>"[,"c":true]}}
//
// The key is a single PBKDF2-HMAC-SHA256 over the primary key, used directly as
// the AES key. There is no per-record data key — that shape only appears under
// EnvelopeEncryptionKeyProvider, which this app does not use. Neither column is
// declared `deterministic:`, so the IV is random and output need only decrypt
// under Rails, not match it byte for byte.
//
// The digest is NOT recorded in the envelope. It is config, and Rails silently
// flipped it SHA-1 -> SHA-256 in load_defaults "7.1". gallery-api runs
// load_defaults 8.1, so SHA-256 is correct here — but if these values ever fail
// to decrypt after a Rails upgrade, this constant is the first thing to check.
const PBKDF2_ITERATIONS = 65_536;
const PBKDF2_DIGEST = "sha256";
const KEY_LENGTH = 32;

// Rails deflates the plaintext before encrypting when it exceeds this many
// bytes, and records that with a "c":true header.
const COMPRESSION_THRESHOLD = 140;

const key = crypto.pbkdf2Sync(
  encryptionKeys.primaryKey,
  encryptionKeys.keyDerivationSalt,
  PBKDF2_ITERATIONS,
  KEY_LENGTH,
  PBKDF2_DIGEST,
);

interface Headers {
  iv: string;
  at: string;
  c?: true;
}

export function encrypt(plaintext: string): string {
  let payload = Buffer.from(plaintext, "utf8");
  let compressed = false;

  if (payload.length > COMPRESSION_THRESHOLD) {
    payload = zlib.deflateSync(payload);
    compressed = true;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);

  const headers: Headers = {
    iv: iv.toString("base64"),
    at: cipher.getAuthTag().toString("base64"),
  };
  if (compressed) headers.c = true;

  return JSON.stringify({ p: ciphertext.toString("base64"), h: headers });
}

// Not used by the suite itself, but the inverse is what proves a seeded value
// round-trips. Kept so the assertion in tests/s3-credentials.test.ts can read
// back what Rails wrote.
export function decrypt(envelope: string): string {
  const message = JSON.parse(envelope) as { p: string; h?: Partial<Headers> };
  const headers = message.h ?? {};
  if (!headers.iv || !headers.at) {
    throw new Error("envelope is missing the iv or auth-tag header");
  }

  const authTag = Buffer.from(headers.at, "base64");
  if (authTag.length !== 16) {
    throw new Error(`expected a 16-byte auth tag, got ${authTag.length}`);
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(headers.iv, "base64"));
  decipher.setAuthTag(authTag);

  let plaintext = Buffer.concat([
    decipher.update(Buffer.from(message.p, "base64")),
    decipher.final(),
  ]);
  if (headers.c) plaintext = zlib.inflateSync(plaintext);

  return plaintext.toString("utf8");
}
