import type { Article, Category, NewsResponse } from "../shared/news.js";
import type { Config } from "./config.js";
import type { NewsStore, CacheEntry } from "./store.js";
import { NewsError } from "./errors.js";

export class NewsService {
  private readonly pending = new Map<Category, Promise<CacheEntry>>();
  private retryAt = 0;

  constructor(
    private readonly config: Config,
    private readonly store: NewsStore,
    private readonly load: (category: Category) => Promise<Article[]>,
    private readonly now: () => number = Date.now,
  ) {}

  async get(category: Category): Promise<NewsResponse> {
    const cached = await this.store.get(category);
    const freshUntil =
      (cached?.fetchedAt ?? 0) + this.config.CACHE_TTL_SECONDS * 1000;
    if (cached && this.now() < freshUntil)
      return this.response(category, cached, false);
    try {
      if (this.now() < this.retryAt) throw new NewsError("upstream_cooldown");
      let refresh = this.pending.get(category);
      if (!refresh) {
        refresh = (this.store.withRefresh
          ? this.store.withRefresh(category, () => this.refresh(category))
          : this.refresh(category)).finally(() =>
          this.pending.delete(category),
        );
        this.pending.set(category, refresh);
      }
      return this.response(category, await refresh, false);
    } catch (error) {
      if (
        cached &&
        this.now() < freshUntil + this.config.STALE_IF_ERROR_SECONDS * 1000
      )
        return this.response(category, cached, true);
      throw error;
    }
  }

  private async refresh(category: Category): Promise<CacheEntry> {
    try {
      // Another request may have completed its refresh during our initial disk read.
      const latest = await this.store.get(category);
      if (
        latest &&
        this.now() < latest.fetchedAt + this.config.CACHE_TTL_SECONDS * 1000
      )
        return latest;
      await this.store.reserveRequest(
        this.now(),
        this.config.NEWS_API_DAILY_BUDGET,
      );
      const entry: CacheEntry = {
        version: 1,
        fetchedAt: this.now(),
        articles: await this.load(category),
      };
      await this.store.set(category, entry);
      return entry;
    } catch (error) {
      this.retryAt = this.now() + this.config.UPSTREAM_RETRY_SECONDS * 1000;
      throw error;
    }
  }

  private response(
    category: Category,
    entry: CacheEntry,
    stale: boolean,
  ): NewsResponse {
    return {
      category,
      articles: entry.articles,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      expiresAt: new Date(
        entry.fetchedAt + this.config.CACHE_TTL_SECONDS * 1000,
      ).toISOString(),
      stale,
      demo: this.config.DEMO_MODE === "true",
    };
  }
}
