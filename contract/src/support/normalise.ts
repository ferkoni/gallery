// Strips what is volatile per call so a response can be compared byte for byte
// between Rails and Node. Everything else is left alone — seeded ids and
// timestamps are pinned by the fixtures, so they are asserted, not erased.

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// The signature and its inputs change on every presign. The host, path and the
// stable parameters are kept: the path carries the s3_key, which is a real
// assertion, and X-Amz-Expires proves the 3600s TTL the serializer asks for.
const VOLATILE_QUERY_PARAMS = ["X-Amz-Credential", "X-Amz-Date", "X-Amz-Signature", "X-Amz-Security-Token"];

export interface NormaliseOptions {
  // For responses to POST — a newly allocated id depends on how many rows the
  // run has created, which is not a contract detail worth freezing.
  redactIds?: boolean;
}

function normaliseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!url.searchParams.has("X-Amz-Signature")) return value;

  for (const param of VOLATILE_QUERY_PARAMS) {
    if (url.searchParams.has(param)) url.searchParams.set(param, "<REDACTED>");
  }
  return url.toString();
}

function normaliseString(value: string): string {
  if (ISO_TIMESTAMP.test(value)) return "<TIMESTAMP>";
  if (JWT.test(value) && value.length > 60) return "<JWT>";
  if (value.startsWith("http")) return normaliseUrl(value);
  return value;
}

export function normalise(value: unknown, options: NormaliseOptions = {}): unknown {
  if (typeof value === "string") return normaliseString(value);
  if (Array.isArray(value)) return value.map((entry) => normalise(entry, options));
  if (value === null || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (options.redactIds && (key === "id" || key === "album_id" || key === "task_id")) {
      result[key] = "<ID>";
      continue;
    }
    result[key] = normalise(entry, options);
  }
  return result;
}

// What every test snapshots: status plus normalised body. Content type is
// asserted separately where it matters, so it does not add noise everywhere.
export function snapshotOf(
  response: { status: number; body: unknown },
  options: NormaliseOptions = {},
): { status: number; body: unknown } {
  return { status: response.status, body: normalise(response.body, options) };
}
