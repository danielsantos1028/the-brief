import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskStore } from "../server/store";
import { NewsService } from "../server/service";
import { readConfig } from "../server/config";
import { NewsError } from "../server/errors";
import { fetchHeadlines } from "../server/newsapi";
import { buildApp } from "../server/app";
import type { Article } from "../shared/news";

const directories: string[] = [];
const article: Article = {
  id: "a",
  title: "Test headline",
  description: null,
  url: "https://example.com/story",
  imageUrl: null,
  source: "Test source",
  publishedAt: null,
};
const start = Date.parse("2026-01-01T00:00:00Z");

async function setup(overrides: NodeJS.ProcessEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), "brief-test-"));
  directories.push(dir);
  const config = readConfig({
    NEWS_API_KEY: "test-secret-never-public",
    CACHE_DIR: dir,
    ...overrides,
  });
  const store = new DiskStore(dir);
  await store.init();
  let time = start;
  const load = vi.fn(async () => [article]);
  const service = new NewsService(config, store, load, () => time);
  return {
    dir,
    config,
    store,
    load,
    service,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("persistent cache", () => {
  it("reuses headlines for two hours and refreshes at expiry", async () => {
    const s = await setup();
    await s.service.get("general");
    s.advance(7200 * 1000 - 1);
    await s.service.get("general");
    expect(s.load).toHaveBeenCalledTimes(1);
    s.advance(1);
    await s.service.get("general");
    expect(s.load).toHaveBeenCalledTimes(2);
  });
  it("uses a configured TTL instead of hardcoding two hours", async () => {
    const s = await setup({ CACHE_TTL_SECONDS: "60" });
    await s.service.get("general");
    s.advance(60000);
    await s.service.get("general");
    expect(s.load).toHaveBeenCalledTimes(2);
  });
  it("coalesces simultaneous requests for the same category", async () => {
    const s = await setup();
    await Promise.all(
      Array.from({ length: 30 }, () => s.service.get("technology")),
    );
    expect(s.load).toHaveBeenCalledTimes(1);
  });
  it("isolates category entries", async () => {
    const s = await setup();
    await s.service.get("science");
    await s.service.get("sports");
    await s.service.get("science");
    expect(s.load).toHaveBeenCalledTimes(2);
  });
  it("reads the same cached edition after a service restart", async () => {
    const s = await setup();
    const original = await s.service.get("business");
    const restarted = new NewsService(
      s.config,
      new DiskStore(s.dir),
      s.load,
      () => start + 1000,
    );
    expect(await restarted.get("business")).toEqual(original);
    expect(s.load).toHaveBeenCalledTimes(1);
  });
  it("serves bounded stale data after upstream failure and suppresses immediate retries", async () => {
    const s = await setup({
      CACHE_TTL_SECONDS: "60",
      STALE_IF_ERROR_SECONDS: "120",
    });
    await s.service.get("general");
    s.advance(60000);
    s.load.mockRejectedValue(new NewsError("upstream_unavailable"));
    expect((await s.service.get("general")).stale).toBe(true);
    expect((await s.service.get("general")).stale).toBe(true);
    expect(s.load).toHaveBeenCalledTimes(2);
    s.advance(120000);
    await expect(s.service.get("general")).rejects.toBeInstanceOf(NewsError);
  });
  it("does not invent a successful empty edition on failure", async () => {
    const s = await setup();
    s.load.mockRejectedValue(new NewsError("upstream_unavailable"));
    await expect(s.service.get("health")).rejects.toBeInstanceOf(NewsError);
    expect(await s.store.get("health")).toBeNull();
  });
  it("fails closed if cache data is corrupt", async () => {
    const s = await setup();
    await writeFile(join(s.dir, "general.json"), "{broken");
    await expect(s.service.get("general")).rejects.toBeInstanceOf(NewsError);
    expect(s.load).not.toHaveBeenCalled();
  });
});

describe("upstream budget", () => {
  it("atomically limits concurrent reservations and preserves the limit after restart", async () => {
    const s = await setup();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, () => s.store.reserveRequest(start, 3)),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    await expect(
      new DiskStore(s.dir).reserveRequest(start, 3),
    ).rejects.toMatchObject({ code: "daily_budget_exhausted" });
    await expect(
      s.store.reserveRequest(start + 86400000, 3),
    ).resolves.toBeUndefined();
  });
  it("counts failed upstream attempts against the budget", async () => {
    const s = await setup({ NEWS_API_DAILY_BUDGET: "1" });
    s.load.mockRejectedValue(new NewsError("upstream_unavailable"));
    await expect(s.service.get("general")).rejects.toBeInstanceOf(NewsError);
    s.advance(60000);
    await expect(s.service.get("general")).rejects.toMatchObject({
      code: "daily_budget_exhausted",
    });
    expect(s.load).toHaveBeenCalledTimes(1);
  });
  it("never resets a corrupt quota file to zero", async () => {
    const s = await setup();
    await writeFile(join(s.dir, "budget.json"), "{}");
    await expect(s.store.reserveRequest(start, 90)).rejects.toMatchObject({
      code: "cache_unavailable",
    });
  });
});

describe("server boundary", () => {
  it("rejects unknown categories and arbitrary upstream/pagination parameters without fetching", async () => {
    const s = await setup();
    const app = buildApp(s.service);
    for (const path of [
      "/api/news?category=invalid",
      "/api/news?category=general&page=2",
      "/api/news?url=http://internal",
      "/api/news?category=general&category=sports",
    ]) {
      expect((await app.inject(path)).statusCode).toBe(400);
    }
    expect(s.load).not.toHaveBeenCalled();
    await app.close();
  });
  it("returns sanitized errors without secrets or upstream messages", async () => {
    const s = await setup();
    s.load.mockRejectedValue(new Error(`secret=${s.config.NEWS_API_KEY}`));
    const app = buildApp(s.service);
    const response = await app.inject("/api/news");
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(s.config.NEWS_API_KEY);
    expect(response.headers["cache-control"]).toBe("no-store");
    await app.close();
  });
  it("serves news and health through the HTTP boundary", async () => {
    const s = await setup();
    const app = buildApp(s.service);
    expect((await app.inject("/health")).json()).toEqual({ status: "ok" });
    const response = await app.inject("/api/news?category=general");
    expect(response.statusCode).toBe(200);
    expect(response.json().articles).toEqual([article]);
    expect(response.body).not.toContain(s.config.NEWS_API_KEY);
    expect(
      (await app.inject({ method: "POST", url: "/api/news" })).statusCode,
    ).toBe(404);
    await app.close();
  });
});

describe("NewsAPI adapter", () => {
  it("uses a header for the secret, a fixed origin, an abort signal, and no redirects", async () => {
    const s = await setup();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ok", articles: [] })),
      );
    await fetchHeadlines("science", s.config, request);
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://newsapi.org/v2/top-headlines?category=science&country=us&pageSize=100&page=1",
    );
    expect(String(url)).not.toContain(s.config.NEWS_API_KEY);
    expect(options?.headers).toMatchObject({
      "X-Api-Key": s.config.NEWS_API_KEY,
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.redirect).toBe("error");
  });
  it("filters removed stories, unsafe links and duplicate articles", async () => {
    const s = await setup();
    const valid = {
      title: "Real headline",
      url: "https://example.com/a",
      source: { name: "Publisher" },
      urlToImage: "javascript:alert(1)",
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "ok",
            articles: [
              valid,
              valid,
              { ...valid, url: "javascript:alert(1)" },
              { ...valid, title: "[Removed]" },
              null,
            ],
          }),
        ),
      );
    const result = await fetchHeadlines("general", s.config, request);
    expect(result).toHaveLength(1);
    expect(result[0]?.imageUrl).toBeNull();
  });
  it("sanitizes HTTP errors and thrown network errors", async () => {
    const s = await setup();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream secret", { status: 429 }));
    await expect(
      fetchHeadlines("general", s.config, request),
    ).rejects.toMatchObject({
      code: "upstream_quota",
      message:
        "Headlines are temporarily unavailable. Please try again shortly.",
    });
    request.mockRejectedValue(new Error(`key=${s.config.NEWS_API_KEY}`));
    await expect(
      fetchHeadlines("general", s.config, request),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
  it("rejects malformed upstream success payloads", async () => {
    const s = await setup();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    await expect(
      fetchHeadlines("general", s.config, request),
    ).rejects.toMatchObject({ code: "invalid_upstream_response" });
  });
});

describe("configuration", () => {
  it("requires a key unless demo mode is explicitly enabled", () => {
    expect(() => readConfig({})).toThrow("Set NEWS_API_KEY");
    expect(readConfig({ DEMO_MODE: "true" }).CACHE_TTL_SECONDS).toBe(7200);
  });
  it("rejects demo mode in production and invalid cache TTLs", () => {
    expect(() =>
      readConfig({ NODE_ENV: "production", DEMO_MODE: "true" }),
    ).toThrow("Demo mode");
    expect(() =>
      readConfig({ DEMO_MODE: "true", CACHE_TTL_SECONDS: "-1" }),
    ).toThrow("Invalid configuration");
  });
});
