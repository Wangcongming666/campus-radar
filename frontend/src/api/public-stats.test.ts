import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicStats } from "./public-stats";

afterEach(() => vi.unstubAllGlobals());

describe("public statistics", () => {
  it("returns the server's data without replacing it with preview values", async () => {
    const data = { companies: 2, openJobs: 3, experiences: 0, questions: 0, asOf: "2026-10-28T00:00:00Z", dataLabel: "ACTUAL" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data, requestId: "test" }), { status: 200 })));
    expect(await fetchPublicStats()).toEqual(data);
  });
  it("reports an unavailable service instead of returning fake statistics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(fetchPublicStats()).rejects.toThrow();
  });
});
