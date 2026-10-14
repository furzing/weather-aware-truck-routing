# Weather-Aware Truck Routing

React + TypeScript + Django assessment for comparing three road routes using forecast weather, load weight, and driving time. The app checks weather at each checkpoint's estimated arrival, recommends a route using the assessment's priority order, and displays an independent 0–48 hour corridor forecast.

Repository: [furzing/weather-aware-truck-routing](https://github.com/furzing/weather-aware-truck-routing) (private). [GitHub Actions](https://github.com/furzing/weather-aware-truck-routing/actions) verifies the app and deployment preparation. Railway with Railpack is the selected deployment target; no local Docker is required. See the [deployment guide](docs/deployment.md). No public deployment exists yet.

## Run locally

Requires Python 3.13 and Node.js 24. No API key or database is needed for this local evaluation. Internet access is needed for routing, city search, weather, and map tiles.

From the project directory in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
npm --prefix frontend ci
.\scripts\start.ps1
```

Open **http://127.0.0.1:8000**. The launcher builds React, collects static assets, and serves the complete application through Waitress. It stays in the terminal; Ctrl+C stops it.

For frontend development, run Django in one terminal and Vite in another:

```powershell
.\.venv\Scripts\python backend\manage.py runserver 127.0.0.1:8000
npm --prefix frontend run dev
```

Then open http://127.0.0.1:5173. Vite proxies `/api` to Django. Do not use the Django development server for hosting.

## Use it

1. Start with Chicago → Detroit, or search for cities with the search button or Enter. Select an unambiguous result. Search supports city names and postal codes, not arbitrary street addresses.
2. Set departure in the next 72 hours, load weight in pounds, and checkpoint spacing of 10, 25, or 50 miles. Dates and ETAs display in the browser's labelled timezone; requests and calculations use UTC.
3. Compare routes. Inputs collapse to a summary; Edit trip reopens them. Select a route in the Routes view. The map stays unobstructed; open Checkpoints in the bottom action strip to inspect arrival times and risk explanations. A table checkpoint pans the map; Fit routes restores the whole trip.
4. Open Weather in the sidebar and move the forecast slider from departure through +48 hours. It updates the preloaded, interpolated weather field without making forecast requests. Route risk remains tied to checkpoint ETAs. The sidebar shows when forecasts were retrieved and explains the 10-minute cache; displayed trips do not automatically refresh.
5. Open **Rules** at `/rules` for ranking mechanics, weather/load thresholds, forecast updates, U.S. federal property-carrying HOS guidance, ELD record practices, and departure checks. Returning to the planner preserves the current trip in memory. Reloading the app starts a new session.
6. Press **Simulate drive** to advance a truck marker along the selected road using its segment travel times. Forecast time and the weather field advance together. Pause, seek, reset, or change playback speed; arrival stops playback. Route changes and leaving the planner pause it. The conditions at the marker are interpolated display estimates; the next High-or-worse checkpoint retains its original arrival-based assessment.

On phones, a bottom dock contains Trip, Routes, Weather, and Checkpoints. Routes and Weather open upward in a scrollable sheet capped at 36% of the viewport; the map refits above it. Selecting a route closes the sheet; another press, Close planning panel, or Escape also closes it. Trip opens the input form with its Compare action kept visible while scrolling. Settings, GPS, Fit routes, playback, and zoom sit near the map's bottom edge; Rules is in Map settings. The dock uses dynamic viewport height and bottom safe-area padding rather than overlapping the browser or gesture area.

Checkpoints can be resized with the handle or dragged down to hide. During dragging, the map keeps its size and the drawer follows the pointer; releasing commits the new map space once. The close button also hides it. Keyboard users can focus the handle and use Up/Down to resize, End to expand, or Home/Escape to close. Reduced-motion preferences remove drawer and marker transitions.

Use the map's **Map settings** button for Light, Dark, or Auto appearance. Auto switches at 8 PM and 6 AM in the device's local timezone; Light is the default. The choice is saved in browser storage. The separate **Enable device location** button requests browser permission and starts position updates while the planner is open and the browser reports online. The blue marker and accuracy circle are distinct from the simulated truck. Offline, stale, denied, and unavailable states are labelled. Stop device location ends the watch; location is not stored or sent to the planner API. GPS does not reroute, advance forecast time, or refresh weather. Hosted GPS access requires HTTPS; localhost works for local evaluation. A phone's `localhost` refers to that phone, not this computer.

Comparing routes shows an animated spinner and indeterminate bar, elapsed seconds, and Cancel planning. Reduced-motion users keep the text and elapsed-time feedback. No percentage or completed provider stage is invented.

Arrival estimates include standard U.S. property-carrying breaks/rest by default: 30 minutes before driving beyond 8 cumulative hours and 10 hours off duty before exceeding 11 driving hours per shift. The model assumes fresh shift clocks and sufficient 60/70-hour cycle availability; actual ELD records, loading, inspections, exceptions, traffic, and cross-border rules are not evaluated. Stop coordinates are timing estimates, not verified parking. Driving and total trip durations are shown separately. Weather is assessed at delayed arrivals and throughout stops. No Travel at a sampled stop excludes a route without adding driven risk miles. Playback holds the truck during stops while forecast time advances. Trips exceeding the 48-hour preview after rest are rejected. The optional continuous-driving view excludes stops and is not a driver schedule.

All three routes show arrival-based risk colors and checkpoints. The selected route has a heavier outline. If every route contains No Travel conditions, the app recommends delaying departure. Provider failures never become synthetic weather or an apparently safe route.

## Verify

```powershell
.\.venv\Scripts\python backend\manage.py test routing -v 2
.\.venv\Scripts\python scripts\evaluate_scenarios.py
.\.venv\Scripts\ruff check backend scripts
.\.venv\Scripts\ruff format --check backend scripts
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

Browser checks (with both development servers running) use Playwright CLI:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=spotter open http://127.0.0.1:5173 --headed
npx --yes --package @playwright/cli playwright-cli -s=spotter run-code --filename scripts/browser-checks.js
npx --yes --package @playwright/cli playwright-cli -s=spotter run-code --filename scripts/rules-browser-checks.js
npx --yes --package @playwright/cli playwright-cli -s=spotter run-code --filename scripts/simulation-browser-checks.js
npx --yes --package @playwright/cli playwright-cli -s=spotter run-code --filename scripts/mobile-location-browser-checks.js
npx --yes --package @playwright/cli playwright-cli -s=spotter run-code --filename scripts/performance-browser-checks.js
```

This check makes a few live local planning requests; its failure and No Travel UI cases are explicitly injected. It also checks keyboard controls, mobile overflow, and a populated-state axe accessibility scan. Screenshots go to ignored `output/playwright/`.

The Rules check covers direct links, refresh, browser history, preserved route/forecast selection, section navigation, mobile layout, accessibility, and four injected duration-boundary cases. To check the production build, navigate the CLI session to port 8000 before running it; keep Vite running for the local axe script.

The simulation check covers real road timing and marker movement, pause/seek/reset/arrival, route changes, navigation, zero playback API requests, drawer mouse/touch/keyboard interaction, and 390×844, 320×667, and 844×390 layouts. An explicitly injected temporal storm checks changing weather colors and retained No Travel exclusions. This tests behavior, not forecast accuracy or physical-phone performance.

The mobile/location check adds a deliberate 4.5-second request delay to inspect loading feedback, checks mobile panel/map separation, dark-mode contrast and persistence, and local-time appearance boundaries. GPS positions and permissions are emulated through the native browser API; movement, denial, offline/resume, stale fixes, and stop behavior are checked without planner API calls. This is not a physical GPS accuracy test. If public providers are unavailable, prepare an explicitly captured-plan copy from a verified recording:

```powershell
.\.venv\Scripts\python scripts\forecast_replay.py replay --browser-check scripts\mobile-location-browser-checks.js
npx --yes --package @playwright/cli playwright-cli -s=spotter run-code --filename output/playwright/mobile-location-browser-checks-replay.js
```

The generated copy stays under ignored `output/` and reports that its plan is captured data, not a fresh forecast. It is only a browser-test fixture; the app never substitutes it for a failed provider response.

With the local server running, one live provider smoke check:

```powershell
.\.venv\Scripts\python scripts\live_smoke.py
.\.venv\Scripts\python scripts\production_smoke.py
```

The live check uses public services once and saves its response to ignored `output/live-plan.json`. Do not load-test public providers. [Verification notes](docs/verification.md) distinguish deterministic tests, live results, browser observations, and remaining delivery work. [Walkthrough outline](docs/walkthrough.md) covers a 5–10 minute recording.

The offline evaluation covers 12 manually specified route scenarios, 500 weather/load combinations, sampling and departure sensitivity, DST, malformed responses, retrieval-cache behavior, and mixed-risk API behavior. It also confirms the suite catches three deliberate policy mistakes without editing source. Its JSON report is saved to `output/scenario-evaluation.json`. This is policy evidence, not a forecast-accuracy or fleet-safety score.

Record actual provider replies once, then replay the identical calculation offline:

```powershell
.\.venv\Scripts\python scripts\forecast_replay.py record
.\.venv\Scripts\python scripts\forecast_replay.py replay
```

The default Chicago–Detroit recording goes to ignored `output/provider-recording.json`. `--file` selects another path. Replay blocks HTTP calls and fails on an unmatched request or changed plan digest. It intentionally uses the original departure, bypassing the current-date API window for historical reproduction. It detects regressions against the original calculation; the independent scenario suite checks policy correctness. This is a captured live forecast, not a historical storm backtest.

## Structure and policy

`backend/routing/risk.py` owns the supplied thresholds and lexicographic recommendation. `geometry.py` samples road geometry using segment distances and durations. `providers.py` validates upstream weather units, hours, and missing values. `service.py` assembles the comparison. Django validates and bounds API requests. React validates response data with Zod, owns form/selection state, and synchronizes map layers through Leaflet.

The only endpoints are `GET /api/health`, `GET /api/places?q=Chicago`, and `POST /api/plan`. The application stores no user accounts or trips. Its POST performs a stateless calculation, with no cookie authentication or persisted mutation. The API contract and modelling decisions are in [docs/decisions.md](docs/decisions.md).

## Limits that matter

- **OSRM uses a car profile.** These routes are weather comparisons, not truck navigation. Height, axle/gross weight limits, hazardous materials restrictions, traffic, closures, rest stops, and hours of service are not checked. The load input affects the supplied wind policy only. The product says this visibly.
- OSRM may return fewer than three native alternatives. The adapter then requests actual road routes through lateral corridor waypoints, labels those results, and fails explicitly if three distinct options cannot be found.
- Trips are limited to alternatives up to 1,500 miles / 48 driving hours. Coarser checkpoint spacing can miss localized hazards. Risk miles are estimates, with each interval assigned its worse endpoint risk. Gusts and crosswind direction are not part of the supplied policy.
- The corridor uses a bounded sampled grid around all route alternatives, rendered as an interpolated weather field. Interpolation improves display continuity, not the underlying forecast resolution or recommendation accuracy. It is not radar. Spatial resolution adapts for long corridors.
- Public services have quotas and no availability guarantee. Forecast responses cache for 10 minutes, routes for one hour, and city searches for one day, in process memory. Limits and admission control are per process; they are not distributed abuse protection.

Provider documentation: [OSRM route API](https://project-osrm.org/docs/v26.5.0/http), [Open-Meteo forecast](https://open-meteo.com/en/docs), [geocoding](https://open-meteo.com/en/docs/geocoding-api), and [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Weather data requires [Open-Meteo attribution](https://open-meteo.com/en/terms); it is linked in the app. The free weather API is for noncommercial use. Review provider terms and use an appropriate paid/self-hosted routing, weather, and tile service before operational use.

## Hosting and submission

The repository is published under `furzing`; a public application and Loom recording remain pending. [docs/deployment.md](docs/deployment.md) contains the selected Railway/Railpack setup, secret configuration, costs, and public verification commands. One native Python service serves React and Django from the same origin. The prepared Cloudflare Worker + Container path remains optional. Local startup uses Waitress and needs no hosting account.
