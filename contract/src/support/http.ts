import { baseUrl } from "./config.js";

export interface ApiResponse {
  status: number;
  contentType: string | null;
  body: unknown;
  text: string;
}

export interface RequestOptions {
  token?: string | undefined;
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function request(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let body: BodyInit | undefined;
  if (options.form) {
    // Let fetch set the multipart boundary itself.
    body = options.form;
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const contentType = response.headers.get("content-type");

  let parsed: unknown = text;
  if (text.length > 0 && contentType?.includes("json")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  } else if (text.length === 0) {
    parsed = null;
  }

  return { status: response.status, contentType, body: parsed, text };
}

export const get = (path: string, options?: RequestOptions) => request("GET", path, options);
export const post = (path: string, options?: RequestOptions) => request("POST", path, options);
export const patch = (path: string, options?: RequestOptions) => request("PATCH", path, options);
export const put = (path: string, options?: RequestOptions) => request("PUT", path, options);
export const del = (path: string, options?: RequestOptions) => request("DELETE", path, options);
