import { afterEach, expect, it, vi } from "vitest";
import { fetchBoard } from "./applications";
afterEach(() => vi.unstubAllGlobals());
it("loads an empty real board without sample cards", async () => {
  const data = { items: [], boardVersion: 1, columns: ["PENDING"], stats: { total: 0, applied: 0, interviewing: 0, offers: 0 }, truncated: false };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 })));
  expect(await fetchBoard()).toEqual(data);
});
it("keeps server version conflicts visible to the caller", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "BOARD_VERSION_CONFLICT", message: "看板已更新" } }), { status: 409 })));
  await expect(fetchBoard()).rejects.toMatchObject({ status: 409, code: "BOARD_VERSION_CONFLICT" });
});
