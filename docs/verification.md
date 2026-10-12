# Local verification — 13 October 2026

Environment: Windows, Python 3.13.14, Node.js 24.7.0, npm 11.5.1. Installed versions are frozen in `requirements*.txt` and `frontend/package-lock.json`. Runtime stack: Django 5.2.18, React 19.3.0, TypeScript 5.9.3, Vite 8.3.4, Leaflet 1.9.4. This record describes local evidence, not a hosted release or a capacity benchmark.

## Requirement coverage

| Requirement | Implementation and evidence |
| --- | --- |
| Origin, destination, departure, load | Search/selection and form → validated Django JSON boundary. Keyboard city search and preserved invalid input checked in the browser. |
| Three routing API options | Live OSRM check returned three actual road routes; the third uses a labelled corridor waypoint because only two native alternatives were available. |
| 10 / 25 / 50 mile checkpoints | Domain tests check all spacings, destination inclusion, partial intervals, variable-speed ETAs, and zero-length endpoint segments. Browser changed 25 to 10 miles and observed more checkpoints. |
| ETA-specific weather | Segment-based cumulative duration → UTC ETA → containing hourly forecast. Adapter tests independently verify timestamp selection and mm/cm conversion. |
| Supplied risk/load rules | Boundary cases cover all wind/rain/snow levels and strict weight comparisons. No Travel exclusions and all-blocked behavior checked at the API boundary. |
| Risk/time recommendation | Tests check each lexicographic priority independently, hard exclusion, and no recommendation when every route is blocked. |
| Routes, checkpoints, risk, ETAs, summaries on map | Actual Leaflet canvas rendering inspected. All alternatives have risk segments and checkpoint tooltips; selection updates the detail table and emphasis. Table checkpoint focus pans the map. |
| Corridor weather + 0–48 hour slider | Live response had 103 grid cells with 49 forecast samples each. Keyboard End reached +48; slider/layer controls made zero API requests and left trip ETAs unchanged. |
| Delivery artifacts | Local project, launch script, lockfiles, prepared CI/Docker, README, decisions, verification, and 7-minute walkthrough outline. GitHub publication, hosting, and Loom recording remain deferred. |

## Checks run

- `python backend/manage.py test routing -v 1`: **20 tests passed**, including table-driven boundary cases. Provider calls are mocked at the adapter boundary where deterministic behavior is under test.
- `ruff check backend scripts` and `ruff format --check backend scripts`: passed.
- `npm --prefix frontend run lint`, `run format:check`, `test`, and `run build`: passed. **4 frontend contract tests passed**. TypeScript strict compilation is included in the build.
- A clean `npm ci` reinstall from the lockfile, followed by the same frontend checks and production build, passed. Stop Vite before reinstalling dependencies on Windows; its native build module is locked while the server is running.
- `pip check`: passed. `npm audit --audit-level=moderate`: reported zero known vulnerabilities in the installed dependency tree. This does not establish application security.
- `scripts/live_smoke.py`: real geocoding, routing, and forecast data through the local HTTP API; three routes of 281.6 / 296.6 / 321.9 miles, 13 / 13 / 14 checkpoints, 103 corridor cells, 133 unique forecast locations. The original planning observation took 2.83 seconds; a later partly cached run took 0.57 seconds. These single observations are not performance percentiles. All checkpoint conditions on this trip were Low at the tested departure.
- `scripts/browser-checks.js` via Playwright CLI: passed at 1440×1000, with 390- and 320-pixel overflow checks. Route switching, map focus, city keyboard selection, sampling changes, dirty input, failure preservation, and slider behavior passed. No page JavaScript errors were observed during the check.
- Axe WCAG 2 A/AA and 2.1 AA scan on the populated desktop state: zero detected violations. Manual keyboard paths and visual inspection supplement this; no screen-reader audit or full accessibility certification was performed.
- Browser provider-failure and all-No-Travel scenarios were **injected test responses**, not live severe-weather claims. The server's real all-blocked policy is separately exercised in the Django tests. Screenshots of injected scenarios are labelled in their filenames.
- `scripts/production_smoke.py`: built HTML and hashed JS/CSS/font assets served successfully from Waitress/Django on port 8000. HTML requires revalidation; fingerprinted assets are immutable. Health, 404, and invalid-trip behavior passed. `scripts/start.ps1` was run successfully after correcting Windows npm shim invocation.
- The actual production browser page at port 8000 also returned three routes and 13 selected-route checkpoints; keyboard End reached +48 and Home restored departure.

Visual inspection caught a CARTO tile URL returning API-key placeholders; it was replaced with the official OSM tile endpoint. The corrected real basemap was inspected. The font is bundled locally. A resize check prompted refitting map bounds on container resize. Browser output and screenshots are under ignored `output/playwright/`; the live response is in ignored `output/live-plan.json`.

## Remaining limits

No Docker engine is available here, so the container build is prepared but unexecuted. GitHub Actions has not run remotely. No public application, GitHub remote, or Loom video exists yet; those are final-submission tasks following the user's local-first instruction. No production traffic, multi-replica behavior, load test, live provider outage, truck-restriction correctness, or forecast accuracy study was evaluated.

Before submitting: review the local app, publish the tested repository, build/run the container on the chosen host, repeat the deployment smoke checks, and record the walkthrough. Keep the documented car-profile and model-estimate limits visible.
