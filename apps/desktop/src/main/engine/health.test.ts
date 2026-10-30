import { describe, expect, it, vi } from "vitest";
import { waitForHealth } from "./health.ts";

describe("waitForHealth", () => {
  it("resolves with the health payload on the first 200", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "ok", version: "0.1.0", api_version: 1 }));
    await expect(
      waitForHealth("http://127.0.0.1:9", { timeoutMs: 2000, intervalMs: 1, fetchFn }),
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("rejects with reason timeout when the engine never answers", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(waitForHealth("http://127.0.0.1:9", { timeoutMs: 20, intervalMs: 5, fetchFn })).rejects.toMatchObject({
      reason: "timeout",
    });
  });
});
