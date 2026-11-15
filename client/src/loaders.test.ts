import { afterEach, describe, expect, it, vi } from "vitest";
import { installDownloadRetry } from "./loaders.ts";

describe("download retry", () => {
  afterEach(() => vi.useRealTimers());

  it("tries a failed hotel download again until it arrives, and leaves other requests alone", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const plain = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/assets/")) {
        calls++;
        if (calls === 1) throw new TypeError("net::ERR_CACHE_WRITE_FAILURE");
        if (calls === 2) return new Response("busy", { status: 503 });
        return new Response("room", { status: 200 });
      }
      throw new TypeError("offline");
    });
    (globalThis as { window?: unknown }).window = { fetch: plain };
    installDownloadRetry();
    const w = (globalThis as unknown as { window: { fetch: typeof fetch } }).window;

    const room = w.fetch("http://localhost/assets/rooms/kitchen.bin");
    await vi.runAllTimersAsync();
    expect(await (await room).text()).toBe("room");
    expect(calls).toBe(3);
    // After a failure the browser's cache is skipped.
    expect(plain.mock.calls[1]![1]).toMatchObject({ cache: "no-store" });

    // Not the hotel's art: one try, as before.
    await expect(w.fetch("http://localhost/health")).rejects.toThrow("offline");

    // A missing file is not asked for again.
    calls = 10;
    plain.mockImplementationOnce(async () => new Response("", { status: 404 }));
    expect((await w.fetch("http://localhost/assets/rooms/none.bin")).status).toBe(404);
  });
});
