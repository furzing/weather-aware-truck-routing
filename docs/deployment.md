# Deployment handoff

## Railway (selected target)

Railway builds this React + Django application from GitHub using Railpack. No local Docker installation or Cloudflare subscription is required. One Waitress service serves React and Django from the same origin. SQLite stores completed comparisons. A persistent volume is required to retain them across deployments.

1. Create a Railway project from the private `furzing/weather-aware-truck-routing` repository, granting the GitHub integration access. Use branch `main` and the repository root.
2. Use the committed `railway.json`: **Railpack** builder, build command `bash scripts/build.sh`, start command `python scripts/serve.py`, health path `/api/health`. Select Railpack explicitly if the dashboard detects the optional Dockerfile. `railpack.json` selects Python 3.13 and Node 24. The build installs locked dependencies, builds React, and collects static files.
3. Attach a Railway volume mounted at `/data` and set `SQLITE_PATH=/data/db.sqlite3`. Keep one replica. Without a volume, comparisons can disappear on container replacement. Volume billing and availability depend on your Railway account; no volume has been created by this change.
4. Add a fresh random `SECRET_KEY` in Railway Variables and set `DEBUG=false`. Generate it with a password manager; never put it in source or chat. The app reads `RAILWAY_PUBLIC_DOMAIN` for its allowed host and permits Railway's health-check hostname. Add any custom hostnames explicitly to `ALLOWED_HOSTS`; do not use `*`.
5. Leave `TRUST_PROXY=false` and `SECURE_SSL_REDIRECT=false` for this configuration. Public HTTPS terminates at Railway. Verify the platform's HTTP-to-HTTPS behavior externally; the app does not trust arbitrary forwarded headers.
6. Generate a public domain in Networking and deploy/redeploy with that hostname available. The server binds `0.0.0.0` and reads Railway's `PORT`; no override is needed. Keep one replica because cache and admission limits are process-local.
7. Run the checks below, test a real phone, and record the deployed commit, deployment identifier, results, and Loom URL before submitting.

```powershell
cd E:\spotter\weather-aware-truck-routing
$deploymentUrl = "https://YOUR-DOMAIN.up.railway.app"
.\.venv\Scripts\python.exe scripts\wait_for_server.py "$deploymentUrl/api/health"
.\.venv\Scripts\python.exe scripts\production_smoke.py $deploymentUrl
.\.venv\Scripts\python.exe scripts\live_smoke.py $deploymentUrl
```

Health/static checks do not prove provider availability. The live check makes one bounded comparison. Check city search, three routes, delayed checkpoint ETAs, planned stops, playback holding during stops, weather slider/layer, `/rules` direct refresh, mobile panels, and GPS permission/denial on HTTPS.

For startup failures, inspect Railway logs for missing secrets, build versions, and the start command. For `DisallowedHost`, check the public domain and health-check hostname. If the UI loads but planning fails, inspect provider errors and outbound access; never substitute synthetic safe forecasts.

Railway currently lists a 30-day trial with $5 credit, a Free plan with a small monthly allowance, and Hobby with $5 minimum usage including $5 credit. Resource usage can exceed included credits. Check account eligibility, current pricing, and usage limits. No paid plan or public Railway deployment has been created during preparation.

Sources: [Django deployment](https://docs.railway.com/guides/django), [config as code](https://docs.railway.com/reference/config-as-code), [Railpack configuration](https://railpack.com/config/file/), [pricing](https://railway.com/pricing).

### Saved comparisons

The service runs migrations before accepting requests. SQLite uses `SQLITE_PATH`, defaulting to `backend/db.sqlite3` locally. On Railway attach a persistent volume at `/data`, then set `SQLITE_PATH=/data/db.sqlite3`. Keep one replica and one migration/startup process. A path variable without a mounted volume is not durable storage. The revision does not provision a volume or change billing. See [Railway volumes](https://docs.railway.com/volumes).

Saved links expire after seven days. Physical cleanup runs at startup; on a continuously running instance run `python backend/manage.py purge_expired_trips` daily using your operator tooling. This deletes expired trips and cascades to their routes/checkpoints. Forecast snapshots do not refresh when reopened. There are no accounts; treat the random saved URL as an access link, not an authenticated private record.

For backup, use SQLite's online backup API (or stop writes before copying the database). Keep backups outside the container and test restoring to a separate path. Before schema changes, take a backup and rehearse migration/rollback; reverting application code does not undo stored data. The initial migration only creates new tables. Tests verify schema constraints, atomic rollback, and bounded-query reads on SQLite; PostgreSQL and multiple writers across replicas have not been evaluated.

The optional Cloudflare Container path has ephemeral disk. Its builds remain checked, but it does not provide durable saved comparisons without a separate storage design. Use the Railway volume setup for this revision.

## Other prepared paths

The private repository is [furzing/weather-aware-truck-routing](https://github.com/furzing/weather-aware-truck-routing). The app runs locally through `scripts/start.ps1`. Cloudflare is an optional prepared path; Railway is the selected target. The user submitted a Railway deployment; the latest public revision still needs verification. Docker is unavailable on this machine, so container build/smoke verification runs in GitHub Actions.

The prepared image serves the built React application, Django API, and compressed static files from one origin using Waitress. Startup applies Django migrations before serving. The image uses writable `/app/data` for SQLite; mount persistent storage there to retain comparisons. Back up the database before changing schema or rolling back. No background worker or external cache is required.

```sh
docker build -t weather-aware-truck-routing .
docker run --rm -p 8000:8000 \
  --mount type=volume,source=weather-routing-data,target=/app/data \
  -e SECRET_KEY='<random deployment secret>' \
  -e ALLOWED_HOSTS='localhost,127.0.0.1,your-host.example' \
  weather-aware-truck-routing
```

On a container hosting service, configure its health path as `/api/health` and expose the configured `PORT` (default 8000). Set `SECRET_KEY` to a fresh random secret and `ALLOWED_HOSTS` to the actual hostname. `DEBUG` defaults to false. Only set `TRUST_PROXY=true` and `SECURE_SSL_REDIRECT=true` after confirming the platform replaces the X-Forwarded-Proto header and terminates TLS. HTTPS policy belongs to that known ingress, not arbitrary incoming forwarding headers.

Optional operator configuration: `OSRM_URL` and `WEATHER_URL` replace public evaluation providers with compatible endpoints. Weather subscription credentials would require extending the adapter to pass its key server-side; no credential input is exposed to the browser. The tile URL and attribution can be replaced at build time with `VITE_TILE_URL` / `VITE_TILE_ATTRIBUTION`. Use a provider appropriate to deployment traffic and its licensing. Browser requests use normal tile caching and keep Referer headers; no offline download or bulk prefetch exists.

After hosting, verify:

1. `/api/health` returns 200 over HTTPS.
2. `/` and its hashed JS, CSS, and font assets return 200 with correct content types.
3. City search works, and one bounded live Chicago → Detroit comparison returns three routes and 49 corridor hours.
4. Route selection, checkpoint focus, keyboard slider controls, and narrow-screen layout work from the public URL.
5. Invalid inputs and provider failures remain visible without clearing the form. Debug tracebacks are not exposed.
6. No secrets or local output files are in the GitHub repository or container context. Check provider terms before making the site public.

CI runs lint, format checks, domain/API tests, frontend contract tests, the production build, and static collection. It deliberately avoids calling public providers. Run the live smoke separately against the deployed URL once. Record the deployed commit and result in the verification notes before submission.

Public-demo limits: caches, admission control, and rate limits are per process. Behind a proxy, remote-address limits may aggregate users at the proxy address; do not trust arbitrary client IP headers to bypass this. A higher-traffic service needs appropriate ingress limits and provider capacity rather than simply adding replicas.

## Cloudflare Worker and Container

Use `cloudflare/wrangler.jsonc` and its separate npm lockfile. This follows Cloudflare's [static frontend/container backend pattern](https://developers.cloudflare.com/containers/examples/container-backend/) while retaining the tested Django/HTTPX/threaded provider runtime. A Python Workers port would require separate compatibility and concurrency validation; it is not necessary for this deployment.

Request path: browser → HTTPS Worker → React static assets, or `/api/*` → one named Durable Object → Django/Waitress Container → routing/weather providers. The existing root Dockerfile remains usable for other hosts. Its build context is explicitly the repository root. No application database, KV namespace, trip storage, or cross-origin API configuration is added; the Durable Object's SQLite storage is used by the Container lifecycle helpers.

- `/`, `/rules`, and `/rules/` use the same revalidated HTML. Unknown paths remain 404; fingerprinted assets are immutable. Static pages do not wake the container.
- API bodies, queries, response statuses, and JSON provider errors are preserved; API responses use `no-store`. Missing configuration, thrown infrastructure errors, and non-JSON container startup failures become explicit JSON 503 responses rather than successful plans or exposed startup details.
- The Worker replaces the internal Host and forwarded HTTPS header and removes caller-provided forwarding chains. Django accepts only localhost/127.0.0.1 internally, and trusts the HTTPS header supplied by this fixed Worker boundary. Container access stays behind that boundary. No wildcard public host configuration is required.
- One `basic` instance is configured, with `max_instances: 1` and a five-minute idle sleep. This preserves existing process-local caching and admission limits. Cold starts and sleeping clear in-memory cache state. Limits may aggregate clients behind the container proxy; this remains a small assessment demo rather than a measured high-traffic deployment.
- The runtime secret comes from the Worker secret `DJANGO_SECRET_KEY`, not a source/build variable. `.dev.vars` and Wrangler output are ignored and excluded from the Docker context. `.dev.vars.example` is a labelled local example only.

Cloudflare Containers requires Workers Paid. At the 13 October 2026 review, the base plan is $5/month with included allowances and additional usage charges; container memory/disk depend on provisioned size. The configuration is not a spending cap. Review [current pricing](https://developers.cloudflare.com/containers/platform/pricing/) and confirm account eligibility before publishing. No subscription or paid resource was created during preparation.

From the repository root, verify the prepared files without deploying:

```powershell
npm --prefix cloudflare ci
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix cloudflare run check
npm --prefix cloudflare run check:worker
```

`check:worker` validates and bundles the Worker/config/static asset bindings without Docker or publishing. `dry-run` additionally builds the container and requires a Docker-compatible engine. CI runs the full dry run, builds/runs the deployment image, and checks its actual HTML, assets, health, 404, and invalid-request boundaries. Node tests exercise routing and proxy-header/error/cache behavior using boundary stubs; they are not a live Cloudflare Container test.

When ready to publish, use a Docker-enabled machine or Cloudflare Workers Builds with Docker support:

```powershell
cd cloudflare
npm ci
npx wrangler login
npx wrangler whoami
npx wrangler secret put DJANGO_SECRET_KEY
npm run deploy
```

Enter a fresh random secret at the secret prompt; never paste it into a tracked file or command history. If multiple accounts are available, set `CLOUDFLARE_ACCOUNT_ID` in the deployment environment. The currently installed local OAuth token reports missing expected scopes; `wrangler login` refreshes them before publishing. Creating a secret may provision the named Worker before the first code deployment. `npm run deploy` checks types/routing, builds React, then deploys the Worker and container image. It is a publishing command; none of the preparation checks run it.

The resulting URL is `https://weather-aware-truck-routing.<your-workers-subdomain>.workers.dev`. Initial container provisioning can take several minutes. Set the public URL only after verifying it. If the first deploy fails after uploading Worker code, check both Worker and Container status: these updates are not transactional. See Cloudflare's [deployment guide](https://developers.cloudflare.com/containers/guides/deploy/).

After deployment:

```powershell
.\.venv\Scripts\python scripts\wait_for_server.py https://YOUR-WORKER.workers.dev/api/health
.\.venv\Scripts\python scripts\production_smoke.py https://YOUR-WORKER.workers.dev
.\.venv\Scripts\python scripts\live_smoke.py https://YOUR-WORKER.workers.dev
```

Then test the public URL on a real phone: compare, route selection, Weather slider/layer, checkpoints, playback, night mode, and device GPS permission/denial. HTTPS permits location access, but a network connection alone does not guarantee a fix. Record the deployed Git commit, Cloudflare deployment version, final CI result, public smoke results, and walkthrough URL before submission. Keep the repository private until reviewer access or a visibility change is arranged.

For local Cloudflare emulation, copy `cloudflare/.dev.vars.example` to `.dev.vars`, replace its example value, build React, and run `npm --prefix cloudflare run dev` with Docker running. The normal `scripts/start.ps1` local workflow remains independent of Docker.
