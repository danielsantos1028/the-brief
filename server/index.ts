import { join } from "node:path";
import { readConfig } from "./config.js";
import { DiskStore } from "./store.js";
import { NewsService } from "./service.js";
import { fetchHeadlines } from "./newsapi.js";
import { demoHeadlines } from "./demo.js";
import { buildApp } from "./app.js";

try {
  const config = readConfig();
  const demo = config.DEMO_MODE === "true";
  const store = new DiskStore(join(config.CACHE_DIR, demo ? "demo" : "live"));
  await store.init();
  const service = new NewsService(
    config,
    store,
    demo ? demoHeadlines : (category) => fetchHeadlines(category, config),
  );
  const app = buildApp(service, true);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
  await app.listen({ host: "127.0.0.1", port: config.API_PORT });
} catch {
  // Configuration values and raw errors may contain secrets; keep startup output fixed.
  console.error(
    "Unable to start. Check the documented environment variables and cache-directory permissions.",
  );
  process.exitCode = 1;
}
