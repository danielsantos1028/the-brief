# The Brief

A category-based news reader built with React, TypeScript, Fastify, and Nginx. NewsAPI credentials stay on the server. Headlines are cached on disk for **two hours by default**, with the same edition shared by every reader.

## Architecture

```text
Browser ──HTTPS── Railway edge ── Nginx (PORT)
                                   ├── built React files
                                   └── /api/news ── Fastify (127.0.0.1:3001)
                                                       ├── persistent cache (/data/news)
                                                       └── NewsAPI (X-Api-Key header)
```

Nginx is a real reverse proxy, serves the frontend, limits API traffic, and supplies security headers. The backend protects the secret by making the authenticated upstream request itself and returning only normalized article data. Adding a proxy alone does not make a browser-exposed API key secret.

## Run locally

Requires **Node 22.12+** and npm. Use Node 22 for parity with the Docker image.

```sh
cp .env.example .env
npm ci
npm run dev
```

Open **http://localhost:5173**. The example environment explicitly enables demo mode, which uses clearly labeled fictional stories and makes no NewsAPI calls.

For real headlines, edit `.env`:

```dotenv
DEMO_MODE=false
NEWS_API_KEY=your_key_here
```

Restart the development server after environment changes. Never use a `VITE_` variable for the key. Demo and live caches use separate directories. Development uses Vite's proxy; the production container uses Nginx.

## Run the complete Nginx stack

Set a real `NEWS_API_KEY` in `.env`, then:

```sh
docker compose up --build -d
docker compose logs -f
```

Open **http://localhost:8080**. Docker publishes Nginx on loopback only. The API port is private. The named `headlines` volume persists news and the request counter across container replacement. Production refuses demo mode.

`npm start` starts only the internal API, for diagnostics; use Docker for the complete production app. `API_PORT` is configurable in local development only; changing it also requires updating Vite's proxy. The container fixes the private API port at 3001 and uses Railway's `PORT` for Nginx.

## Cache and request behavior

- Exactly seven categories, one upstream country (`us`), and one upstream page per category. Arbitrary URLs, search parameters, and upstream pagination cannot be supplied by clients.
- A cold request fetches up to **100 headlines** and saves the normalized response. Following requests reuse it until the configured TTL expires. Refresh is demand-driven; idle categories cost no requests.
- Concurrent requests for the same category share one refresh. A second disk check closes the race with a just-completed refresh.
- “More headlines” reveals items already returned to the browser. It makes **no additional API request**. Results beyond NewsAPI's first 100 are intentionally outside this project's scope.
- An upstream timeout or error can fall back to a previous edition for a bounded additional period. The UI labels it as an earlier edition. After that window, requests fail with a sanitized error.
- Failures trigger a short server-wide cooldown. There are no automatic upstream retries. A persistent daily budget counts attempts before fetching, including failures. The UTC day determines when it resets.
- Disk writes use private permissions and atomic renames. A corrupt cache or quota file fails closed instead of silently spending more upstream quota. Startup checks directory writability.
- API responses use `Cache-Control: no-store`: the disk cache owns freshness, avoiding a second browser/CDN TTL that could hide a stale-data notice. Static asset requests do not call NewsAPI.

With continuous readership of all seven categories, the normal two-hour schedule is roughly **7 × 12 = 84 requests/day**, plus any failed attempts and unusual cold starts. The default budget is 90. Other applications using the same NewsAPI key are not included in this counter. Do not delete the volume or budget file to reset usage.

## Configuration

| Variable                 | Default               | Purpose                                                  |
| ------------------------ | --------------------- | -------------------------------------------------------- |
| `NEWS_API_KEY`           | Required in live mode | Server-side NewsAPI credential                           |
| `CACHE_TTL_SECONDS`      | `7200`                | Fresh lifetime, 60–86,400 seconds                        |
| `STALE_IF_ERROR_SECONDS` | `86400`               | Additional stale allowance after expiry; `0` disables it |
| `NEWS_API_DAILY_BUDGET`  | `90`                  | Maximum upstream attempts per UTC day                    |
| `UPSTREAM_TIMEOUT_MS`    | `8000`                | Upstream request timeout                                 |
| `UPSTREAM_RETRY_SECONDS` | `60`                  | Cooldown after refresh failures                          |
| `CACHE_DIR`              | `.cache/news`         | Local directory; fixed to `/data/news` in Docker         |
| `DEMO_MODE`              | `false`               | Explicit sample content; prohibited in production        |
| `PORT`                   | `8080` in Docker      | Public Nginx listener, 1024–65535                        |
| `API_PORT`               | `3001`                | Private API listener                                     |

The container starts briefly as root to initialize the volume, then runs both Node and Nginx as the unprivileged `node` user. No credentials are copied into the image, emitted to browser bundles, or included in request logs. NewsAPI errors are translated into fixed public messages. The upstream URL is fixed, redirects are disabled, and external article/image URLs are restricted to appropriate HTTP(S) schemes.

## Quality checks

```sh
npm run check
```

Runs ESLint, the backend tests, strict TypeScript checking, and both production builds. Tests exercise TTL boundaries, persistence, concurrent misses, stale limits, quota reservations, malformed input, upstream normalization, secret redaction, and production configuration. CI also builds the container.

## Deployment

**Recommended: Railway with one service and one persistent volume.** See [the step-by-step deployment guide](docs/DEPLOYMENT.md).

This disk-based implementation deliberately supports **one Node process and one replica**. Do not run multiple replicas, PM2 clusters, or multiple independent services with the same key and expect a shared quota. The Vercel adapter uses Redis for a shared cache, distributed refresh leases, cooldown, and an atomic daily quota counter.

NewsAPI's free Developer plan is for development/testing only and currently has 100 requests/day. Its documented production requirement is independent of your hosting provider. Check your subscription before publishing. [NewsAPI pricing](https://newsapi.org/pricing).

## Scope

Includes category navigation, publisher links, responsive article layouts, client-side pagination, image failure handling, loading/empty/error states, stale-edition notices, cache protection, and deployment configuration. It does not include accounts, arbitrary search, full article scraping, or a database of user activity. Cached results are not an archival record.

## Vercel deployment

`vercel.json` builds the React frontend into `dist/client` and routes `/api/*`
and `/health` to `api/index.ts`. The API keeps the existing validation and
sanitized errors. Vercel runs live mode only.

Connect an Upstash Redis database to the Vercel project and set `NEWS_API_KEY`
as a sensitive production environment variable. Redis credentials may use either
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (Marketplace) or
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
Use a non-evicting database so quota counters cannot be evicted early.

The shared cache preserves the configured freshness and stale windows. Refreshes
use a 60-second lease with ownership-checked writes and release. Concurrent cold
requests in other instances can receive a temporary 503 while a refresh runs;
requests with a previous edition fall back to that edition. Redis failures fail
closed. Production and preview use separate key namespaces and quota counters;
use a separate NewsAPI key for preview if enabling it.

Run `npm run check`, then `vercel --prod`. Local/Docker deployments continue to
use the disk store. Never upload `.env` files or put credentials in `VITE_` vars.
