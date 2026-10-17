import type { IncomingMessage, ServerResponse } from "node:http";
import { readConfig } from "../server/config.js";
import { RedisStore } from "../server/redis-store.js";
import { NewsService } from "../server/service.js";
import { fetchHeadlines } from "../server/newsapi.js";
import { buildApp } from "../server/app.js";

let app: ReturnType<typeof buildApp> | undefined;
let ready: Promise<unknown> | undefined;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    if (!app) {
      const config = readConfig({ ...process.env, NODE_ENV: "production", DEMO_MODE: "false" });
      const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) throw new Error("Shared cache configuration missing");
      const store = new RedisStore(url, token,
        config.CACHE_TTL_SECONDS + config.STALE_IF_ERROR_SECONDS,
        config.UPSTREAM_RETRY_SECONDS,
        `brief:${process.env.VERCEL_ENV ?? "development"}`);
      app = buildApp(new NewsService(config, store, category => fetchHeadlines(category, config)), true);
      ready = Promise.resolve(app.ready());
    }
    await ready;
    app.server.emit("request", request, response);
  } catch {
    response.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: "Headlines are temporarily unavailable. Please try again shortly." }));
  }
}
