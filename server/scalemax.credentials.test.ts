import { describe, expect, it } from "vitest";

describe("ScaleMax credentials", () => {
  it("authorizes a lightweight models request with the configured server secret", async () => {
    const baseUrl = process.env.SCALEMAX_BASE_URL?.replace(/\/$/, "");
    const apiKey = process.env.SCALEMAX_API_KEY;
    expect(baseUrl).toBeTruthy();
    expect(apiKey).toBeTruthy();

    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.ok).toBe(true);
  }, 30_000);

  const fallbackCheck = process.env.RUN_MANUS_FALLBACK_CHECK === "true" ? it : it.skip;
  fallbackCheck("authorizes the Manus-compatible fallback model catalog with its server-only key", async () => {
    const baseUrl = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/$/, "");
    const apiKey = process.env.MANUS_FALLBACK_API_KEY;
    expect(baseUrl).toBeTruthy();
    expect(apiKey).toBeTruthy();

    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.ok).toBe(true);
  }, 30_000);
});
