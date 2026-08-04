import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(here, "..", "..");

const envFile = resolve(projectRoot, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy contract/.env.example to contract/.env.`);
  }
  return value;
}

export const baseUrl = (process.env.CONTRACT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const databaseUrl = required("CONTRACT_DATABASE_URL");

export const encryptionKeys = {
  primaryKey: required("ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY"),
  keyDerivationSalt: required("ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT"),
};

export const liveS3 = process.env.CONTRACT_LIVE_S3 === "1";

export const liveS3Credentials = {
  region: process.env.CONTRACT_S3_REGION ?? "",
  bucket: process.env.CONTRACT_S3_BUCKET ?? "",
  accessKeyId: process.env.CONTRACT_S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.CONTRACT_S3_SECRET_ACCESS_KEY ?? "",
};

export const stateFile = resolve(projectRoot, ".contract-state.json");

// Guard against the suite pointing at the database the app actually uses. It
// truncates users, so this is not a recoverable mistake.
if (/gallery_api_development(\b|$)/.test(databaseUrl)) {
  throw new Error(
    "CONTRACT_DATABASE_URL points at gallery_api_development. The suite truncates " +
      "every table it touches — point it at a dedicated database.",
  );
}
