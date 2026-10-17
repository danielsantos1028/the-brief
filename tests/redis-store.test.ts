import { afterEach, describe, expect, it, vi } from "vitest";
import { RedisStore } from "../server/redis-store";

afterEach(() => vi.unstubAllGlobals());

function mockRedis(results: unknown[]) {
  const fetcher = vi.fn(async () => Response.json({ result: results.shift() }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("shared cache failure boundaries", () => {
  const store = () => new RedisStore("https://redis.example", "private-token", 93600, 60);

  it("fails closed on corrupt stored editions", async () => {
    mockRedis(["not-json"]);
    await expect(store().get("general")).rejects.toMatchObject({ code: "cache_unavailable" });
  });

  it("never starts a refresh if another instance holds its lease", async () => {
    mockRedis([null, null]);
    const refresh = vi.fn();
    await expect(store().withRefresh("general", refresh)).rejects.toMatchObject({ code: "refresh_in_progress" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("honors a cooldown created by another instance", async () => {
    mockRedis(["1"]);
    const refresh = vi.fn();
    await expect(store().withRefresh("general", refresh)).rejects.toMatchObject({ code: "upstream_cooldown" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses an exhausted shared daily budget", async () => {
    mockRedis([0]);
    await expect(store().reserveRequest(Date.now(), 90)).rejects.toMatchObject({ code: "daily_budget_exhausted" });
  });

  it("sanitizes provider errors without exposing credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "private-token" })));
    await expect(store().get("general")).rejects.toThrow("Headlines are temporarily unavailable");
  });
});
