# Deployment handoff

The private repository is [furzing/weather-aware-truck-routing](https://github.com/furzing/weather-aware-truck-routing). The app runs locally through `scripts/start.ps1`. Cloudflare configuration is prepared; no public deployment has been created. Docker is unavailable on this machine, so container build/smoke verification runs in GitHub Actions.

The prepared image serves the built React application, Django API, and compressed static files from one origin using Waitress. No writable application storage, migrations, database, background worker, or external cache is required for this assessment. Rebuild to roll back to a previous revision; there are no persisted trip records to migrate.

```sh
docker build -t weather-aware-truck-routing .
docker run --rm -p 8000:8000 \
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

Request path: browser → HTTPS Worker → React static assets, or `/api/*` → one named Durable Object → Django/Waitress Container → routing/weather providers. The existing root Dockerfile remains usable for other hosts. Its build context is explicitly the repository root. No database, KV namespace, new user storage, or cross-origin API configuration is added.

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
