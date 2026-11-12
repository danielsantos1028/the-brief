import { createAdmissionLimit } from "./admission.js";
import Fastify, { LogController } from "fastify";
import { z } from "zod";
import { categorySchema } from "../shared/news.js";
import { NewsService } from "./service.js";
import { NewsError } from "./errors.js";

const querySchema = z
  .object({ category: categorySchema.default("general") })
  .strict();

export function buildApp(service: NewsService, logging = false) {
  const app = Fastify({
    logger: logging,
    logController: new LogController({ disableRequestLogging: true }),
    exposeHeadRoutes: false,
    bodyLimit: 1024,
    requestTimeout: 15000,
    connectionTimeout: 15000,
    // Nginx is the only public listener. Do not trust arbitrary forwarding headers.
    trustProxy: false,
  });
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        route: request.routeOptions.url ?? "unmatched",
        method: request.method,
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request_completed",
    );
  });
  app.get("/health", async () => ({ status: "ok" }));
  const admitNews = createAdmissionLimit();
  app.get("/api/news", async (request, reply) => {
    const retryAfter = admitNews();
    if (retryAfter) return reply.code(429).header("Retry-After", String(retryAfter)).send({ error: "Too many requests. Please try again shortly." });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({
        error:
          "Choose a supported category. Additional query parameters are not accepted.",
      });
    return service.get(parsed.data.category);
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof NewsError) {
      request.log.warn({ code: error.code }, "news_unavailable");
      return reply
        .code(error.status)
        .header("Retry-After", "60")
        .send({ error: error.message });
    }
    request.log.error({ code: "unexpected_error" }, "request_failed");
    return reply
      .code(500)
      .send({ error: "Something went wrong. Please try again shortly." });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: "Not found." }),
  );
  return app;
}
