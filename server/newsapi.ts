import { createHash } from "node:crypto";
import { z } from "zod";
import type { Article, Category } from "../shared/news.js";
import type { Config } from "./config.js";
import { NewsError } from "./errors.js";

const rawArticle = z.object({
  title: z.string().nullable(),
  description: z.string().nullable().optional(),
  url: z.string(),
  urlToImage: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  source: z.object({ name: z.string().nullable() }),
});
const responseSchema = z.object({
  status: z.literal("ok"),
  articles: z.array(z.unknown()).max(100),
});

function safeUrl(
  value: string | null | undefined,
  image = false,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      !(image ? ["https:"] : ["http:", "https:"]).includes(url.protocol)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function fetchHeadlines(
  category: Category,
  config: Config,
  request: typeof fetch = fetch,
): Promise<Article[]> {
  // The upstream origin and country are fixed; this is never an arbitrary URL proxy.
  const url = new URL("https://newsapi.org/v2/top-headlines");
  url.search = new URLSearchParams({
    category,
    country: "us",
    pageSize: "100",
    page: "1",
  }).toString();
  try {
    const response = await request(url, {
      headers: { "X-Api-Key": config.NEWS_API_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(config.UPSTREAM_TIMEOUT_MS),
      redirect: "error",
    });
    if (!response.ok)
      throw new NewsError(
        response.status === 429 ? "upstream_quota" : "upstream_unavailable",
      );
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new NewsError("invalid_upstream_response");
    const articles: Article[] = [];
    const seen = new Set<string>();
    for (const item of parsed.data.articles) {
      const result = rawArticle.safeParse(item);
      if (!result.success) continue;
      const raw = result.data;
      const articleUrl = safeUrl(raw.url);
      const title = raw.title?.trim();
      if (
        !articleUrl ||
        !title ||
        title === "[Removed]" ||
        seen.has(articleUrl)
      )
        continue;
      seen.add(articleUrl);
      articles.push({
        id: createHash("sha256").update(articleUrl).digest("hex").slice(0, 24),
        title: title.slice(0, 500),
        description: raw.description?.slice(0, 2000) || null,
        url: articleUrl,
        imageUrl: safeUrl(raw.urlToImage, true),
        source: raw.source.name?.slice(0, 150) || "Unknown source",
        publishedAt:
          raw.publishedAt && Number.isFinite(Date.parse(raw.publishedAt))
            ? new Date(raw.publishedAt).toISOString()
            : null,
      });
    }
    return articles;
  } catch (error) {
    // Never return/log upstream bodies, request objects, URLs with credentials,
    // or raw exception messages. The public error is intentionally fixed.
    throw error instanceof NewsError
      ? error
      : new NewsError("upstream_unavailable");
  }
}
