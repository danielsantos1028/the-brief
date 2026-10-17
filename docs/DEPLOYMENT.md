# Deployment guide

## Recommendation

Use **Railway** for this implementation. A long-running container and a persistent volume match the local disk cache, avoid a separate cache service, and keep the frontend and API under one origin. Railway supports Dockerfile builds and persistent volumes. [Docker builds](https://docs.railway.com/builds/dockerfiles), [volumes](https://docs.railway.com/volumes).

Vercel is a reasonable alternative if you prefer serverless operation and are willing to replace disk storage with shared Redis. It is not a drop-in deployment target for this Nginx container.

|                       | Railway — supplied implementation   | Vercel — migration option                          |
| --------------------- | ----------------------------------- | -------------------------------------------------- |
| Runtime               | One Node + Nginx container          | Static frontend + serverless API                   |
| Cache                 | JSON files on a persistent volume   | Shared Redis, such as Upstash                      |
| Reverse proxy         | Nginx behind Railway's managed edge | Vercel edge plus the server-side API handler       |
| Scaling               | One replica by design               | Requires distributed locking and shared quota      |
| Operational trade-off | Container and volume to maintain    | External cache service and serverless coordination |

Hosting prices and allowances change. Check [Railway plans](https://docs.railway.com/pricing/plans) and [Vercel pricing](https://vercel.com/pricing) for your account and expected usage. NewsAPI licensing may cost more than the host; check it separately.

## Railway: exact setup

1. Create a Git repository containing this project and push it to your Git provider. Do not commit `.env`, `.cache`, or `node_modules`.
2. Create a Railway project and connect the repository. If this folder is inside a larger repository, set the service's root directory to this folder.
3. Railway should use the included `Dockerfile` and `railway.toml`. The Docker build runs tests, linting, type checking, and production builds.
4. Attach a **persistent volume at `/data`** to the service before using the live API. Without a volume, redeployments can discard both headlines and the quota counter.
5. Set service variables:

   ```dotenv
   NEWS_API_KEY=your_production_key
   CACHE_TTL_SECONDS=7200
   STALE_IF_ERROR_SECONDS=86400
   NEWS_API_DAILY_BUDGET=90
   DEMO_MODE=false
   PORT=8080
   ```

   Keep `NODE_ENV=production` from the Dockerfile. Set the daily budget to match your NewsAPI subscription and other uses of the same credential.

6. Keep **one replica**. Disable overlapping deployments when using the same disk store; do not add worker clusters. The volume is the consistency boundary. The service may briefly be unavailable during replacement.
7. Generate a Railway domain with target port **8080**, or the port you configured. Railway terminates public HTTPS. Do not expose 3001.
8. Deploy and check `/health`, then `/api/news?category=general`. The first category request creates the cached edition; the second should have the same `fetchedAt`. Switch categories in the UI and confirm publisher links open correctly.
9. Restart the service, request the same category again, and confirm that `fetchedAt` remains unchanged while the edition is still fresh. This verifies the mounted volume is actually being used.

`/health` reports that the application started and responds locally; startup validates configuration and cache-directory writability. It does not call NewsAPI or prove that the upstream credential is active. The UI/API check above is the live-data verification step.

Nginx applies an aggregate 10 requests/second API limit with a burst of 30. It deliberately does not trust arbitrary `X-Forwarded-For` headers. For client-specific or volumetric abuse controls, configure Railway's edge protection with its documented trusted-client-IP handling rather than blindly trusting forwarding headers inside the app.

## Cache operations

- Adjust `CACHE_TTL_SECONDS` and restart to change freshness. Expiry is calculated from the stored `fetchedAt` and the current configuration.
- A category is refreshed only when someone reads it after expiry. There is no paid background polling or scheduled job.
- Stale data is clearly labeled. The default maximum age is two hours fresh plus 24 additional hours of stale allowance.
- With all categories continuously read, expect about 84 successful upstream requests/day at the default TTL. Failures can add attempts, but the 90/day guard stops additional calls.
- Preserve `budget.json` during routine cache maintenance. Deleting it resets this application's quota accounting; it does not reset NewsAPI's quota.
- Files use atomic rename and process-local coordination. They are not a transactional multi-process database. A machine crash can lose a very recent non-fsynced write. Use a transactional shared store for strict financial-grade quota accounting or higher availability.
- If a cache or quota file becomes corrupt, investigate and restore it rather than configuring automatic cache deletion. The app fails closed to avoid repeated upstream calls.
- Rotate the NewsAPI key through Railway's environment variables. Rebuilds do not need access to that secret. Redeploy/restart to apply the new value.

## Vercel migration

Do not upload this Dockerfile to Vercel or use a function's local temporary directory as the authoritative two-hour cache. Serverless instances do not share process memory, and a durable shared store is needed to coordinate requests.

The migration would be:

1. Keep the React frontend or move it to Next.js. Preserve same-origin `/api/news?category=...` requests from the browser.
2. Implement `/api/news` as a Node function or Next.js route handler. Keep the NewsAPI key in server-only environment variables and retain the fixed upstream URL, validation, timeout, and error translation.
3. Replace `DiskStore` with a Redis implementation. Vercel supports Redis providers through its Marketplace, including Upstash. [Vercel Redis](https://vercel.com/docs/redis).
4. Store each entry for **fresh TTL + stale allowance**, keeping `fetchedAt` inside it. Expiring the Redis key after only two hours would remove the stale fallback.
5. Use an expiring distributed lock per category (`SET NX PX`) with an owner token and compare-and-delete release. Re-read the cache after acquiring the lock; lock contenders should wait briefly or serve eligible stale data. Process-local promises alone do not prevent duplicate refreshes across functions.
6. Reserve upstream quota with an atomic Redis operation or script before fetching. Share cooldown state across instances too. Fail closed if the cache/quota store is unavailable.
7. Move rate limiting and security headers to Vercel's edge/API configuration, and test concurrency from multiple function instances.

An alternative is to put only the static frontend on Vercel and keep the supplied API/cache on Railway, using a same-origin Vercel rewrite. This adds two deployments and network hops; hosting the whole current project on Railway is simpler.

## NewsAPI constraints

The implementation uses the documented seven headline categories, requests at most 100 results per category, and uses `X-Api-Key` authentication. It is configured for U.S. headlines, which the current endpoint parameter documentation lists. [Top headlines](https://newsapi.org/docs/endpoints/top-headlines), [authentication](https://newsapi.org/docs/authentication).

NewsAPI's Developer plan is restricted to development and testing, not staging or production. A deployed public reader needs an appropriate subscription. Demo mode exists for local preview and is explicitly rejected in production. A proxy does not remove this requirement. [NewsAPI pricing](https://newsapi.org/pricing).
