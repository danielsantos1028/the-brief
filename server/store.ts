import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { articleSchema, type Category } from "../shared/news.js";
import { NewsError } from "./errors.js";

export const entrySchema = z.object({
  version: z.literal(1),
  fetchedAt: z.number().nonnegative(),
  articles: z.array(articleSchema).max(100),
});
export type CacheEntry = z.infer<typeof entrySchema>;
export interface NewsStore {
  get(category: Category): Promise<CacheEntry | null>;
  set(category: Category, entry: CacheEntry): Promise<void>;
  reserveRequest(now: number, maximum: number): Promise<void>;
  withRefresh?(category: Category, refresh: () => Promise<CacheEntry>): Promise<CacheEntry>;
}
const budgetSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
});

// Exactly one Node process owns this directory. Atomic renames protect readers
// from partial writes; horizontal scaling requires a shared store and lock.
export class DiskStore {
  private budgetQueue: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) {}

  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const probe = join(this.directory, `.writable-${randomUUID()}`);
    await writeFile(probe, "", { mode: 0o600 });
    await unlink(probe);
  }

  private async read(name: string): Promise<unknown | null> {
    try {
      return JSON.parse(
        await readFile(join(this.directory, name), "utf8"),
      ) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new NewsError("cache_unavailable");
    }
  }

  private async write(name: string, value: unknown) {
    const temporary = join(this.directory, `${name}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await rename(temporary, join(this.directory, name));
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new NewsError("cache_unavailable");
    }
  }

  async get(category: Category): Promise<CacheEntry | null> {
    const value = await this.read(`${category}.json`);
    if (value === null) return null;
    const result = entrySchema.safeParse(value);
    if (!result.success) throw new NewsError("cache_unavailable");
    return result.data;
  }

  async set(category: Category, entry: CacheEntry) {
    await this.write(`${category}.json`, entry);
  }

  async reserveRequest(now: number, maximum: number) {
    const reservation = this.budgetQueue.then(async () => {
      const date = new Date(now).toISOString().slice(0, 10);
      const value = await this.read("budget.json");
      const parsed =
        value === null ? { date, count: 0 } : budgetSchema.safeParse(value);
      if ("success" in parsed && !parsed.success)
        throw new NewsError("cache_unavailable");
      const previous = "success" in parsed ? parsed.data : parsed;
      const count = previous.date === date ? previous.count : 0;
      if (count >= maximum) throw new NewsError("daily_budget_exhausted");
      // Reserve before fetching so failures and process restarts cannot reset usage.
      await this.write("budget.json", { date, count: count + 1 });
    });
    this.budgetQueue = reservation.catch(() => undefined);
    return reservation;
  }
}
