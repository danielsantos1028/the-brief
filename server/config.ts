import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  NEWS_API_KEY: z.string().trim().default(""),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(7200),
  STALE_IF_ERROR_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(604800)
    .default(86400),
  CACHE_DIR: z.string().min(1).default(".cache/news"),
  NEWS_API_DAILY_BUDGET: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000000)
    .default(90),
  UPSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(20000)
    .default(8000),
  UPSTREAM_RETRY_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const config = result.data;
  if (config.DEMO_MODE === "true" && config.NODE_ENV === "production")
    throw new Error(
      "Demo mode is disabled in production. Set DEMO_MODE=false.",
    );
  if (config.DEMO_MODE !== "true" && !config.NEWS_API_KEY)
    throw new Error(
      "Set NEWS_API_KEY, or enable DEMO_MODE=true for local development.",
    );
  return { ...config, CACHE_DIR: resolve(config.CACHE_DIR) };
}
export type Config = ReturnType<typeof readConfig>;
