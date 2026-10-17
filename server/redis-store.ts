import { randomUUID } from "node:crypto";
import type { Category } from "../shared/news.js";
import { NewsError } from "./errors.js";
import { entrySchema, type CacheEntry, type NewsStore } from "./store.js";

// Redis owns cache, quota, cooldown and refresh leases across all instances.
export class RedisStore implements NewsStore {
  private readonly leases = new Map<Category, string>();
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly retention: number,
    private readonly cooldown: number,
    private readonly prefix = "brief:production",
  ) {}

  private key(name: string) { return `${this.prefix}:${name}`; }

  private async command(...command: (string | number)[]): Promise<unknown> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error();
      const data = await response.json() as { result?: unknown; error?: string };
      if (data.error) throw new Error();
      return data.result;
    } catch { throw new NewsError("cache_unavailable"); }
  }

  async get(category: Category): Promise<CacheEntry | null> {
    const raw = await this.command("GET", this.key(category));
    if (raw === null) return null;
    try { return entrySchema.parse(JSON.parse(String(raw))); }
    catch { throw new NewsError("cache_unavailable"); }
  }

  async set(category: Category, entry: CacheEntry): Promise<void> {
    const result = await this.command("EVAL",
      "if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); return 1",
      2, this.key(`lock:${category}`), this.key(category),
      this.leases.get(category) ?? "", JSON.stringify(entry), this.retention);
    if (result !== 1) throw new NewsError("refresh_lease_expired");
  }

  async reserveRequest(now: number, maximum: number): Promise<void> {
    const day = new Date(now).toISOString().slice(0, 10);
    const result = await this.command("EVAL",
      "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n >= tonumber(ARGV[1]) then return 0 end redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800); return 1",
      1, this.key(`budget:${day}`), maximum);
    if (result !== 1) throw new NewsError("daily_budget_exhausted");
  }

  async withRefresh(category: Category, refresh: () => Promise<CacheEntry>): Promise<CacheEntry> {
    if (await this.command("GET", this.key("cooldown"))) throw new NewsError("upstream_cooldown");
    const token = randomUUID();
    const lock = this.key(`lock:${category}`);
    // Lease exceeds the maximum upstream timeout plus Redis operations.
    if (await this.command("SET", lock, token, "NX", "EX", 60) !== "OK")
      throw new NewsError("refresh_in_progress");
    this.leases.set(category, token);
    try { return await refresh(); }
    catch (error) {
      await this.command("SET", this.key("cooldown"), "1", "EX", this.cooldown).catch(() => undefined);
      throw error;
    } finally {
      this.leases.delete(category);
      await this.command("EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, lock, token).catch(() => undefined);
    }
  }
}
