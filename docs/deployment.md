# Deployment handoff

Local delivery is the current milestone. Hosting and publishing are deferred. The Docker build has not been executed on this machine because Docker is unavailable.

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
