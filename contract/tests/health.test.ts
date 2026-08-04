import { describe, expect, it } from "vitest";
import { get } from "../src/support/http.js";
import { snapshotOf } from "../src/support/normalise.js";

describe("GET /health", () => {
  it("reports ok without authentication", async () => {
    const response = await get("/health");
    expect(snapshotOf(response)).toMatchSnapshot();
  });

  it("does not require a token", async () => {
    const response = await get("/health");
    expect(response.status).toBe(200);
  });
});
