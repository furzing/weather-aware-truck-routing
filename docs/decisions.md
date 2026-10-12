# Domain and API decisions

## Policy interpretation

The brief's rain and snow intervals overlap. At shared boundaries, the higher risk wins: rain 0.25 is High, 0.50 is Severe; snow 1.0 is High, 2.0 is Severe. The explicit No Travel comparisons remain strict: rain >1.00 in/hr and snow >3.0 in/hr. Wind bands are continuous [0,25), [25,35), [35,45), [45,55), [55,∞). This defines fractional values such as 34.9 and 54.9 without gaps.

Load comparisons are strictly greater than 30,000 / 40,000 lb, as written. Overall risk is the maximum of wind, rain, and snow after applying load rules. Values 0–4 are ordinal categories, not calibrated safety probabilities.

No Travel is a hard exclusion before ranking. Eligible routes are compared by the exact tuple `(Severe miles, High miles, distance-weighted average ordinal risk, driving seconds)`, with a stable route identifier for exact ties. No time penalty can make a No Travel route eligible. When all routes are excluded, `recommended_id` is null.

## Geometry, arrival, and exposure

OSRM full GeoJSON geometry must align with the concatenated per-leg distance and duration annotations. Checkpoints include origin, exact requested mile intervals, and destination, without duplicating an exactly aligned destination. Segment interpolation determines geographic location and elapsed time. Annotation totals are scaled to OSRM's route distance and duration so the destination ETA agrees with the provider total, including turn costs. Turn cost placement within the trip is approximate; this is more faithful than constant-speed interpolation over the whole route. Times exclude traffic, breaks, and driver duty limits.

Each checkpoint interval contributes its actual length to the worse of its endpoints' categories. The final partial interval has only its real length. Risk miles sum to total route miles. This is conservative between observed endpoints, but cannot establish the absence of an unobserved hazard. Changing spacing changes the sampling resolution, not the definition of a mile or the ranking policy.

If native alternatives are insufficient, at most four additional OSRM requests use lateral midpoint waypoints. Candidates are deduplicated when shared geometry is at least 98% of the longer route geometry. Edges use coordinates rounded to five decimal places, independent of direction; shared edge lengths are counted up to the smaller occurrence count. Equal distance or duration alone does not reject a candidate. This checks OSRM geometry, not lane identity or topological independence; different segmentation can undercount overlap. Alternatives can still share substantial portions of their roads. No artificial polyline is used as a route.

## Forecast semantics

All timestamps are timezone-aware and normalized to UTC. Open-Meteo returns hourly Unix timestamps. Missing, negative, nonfinite, wrong-unit, misaligned, or non-hourly forecast data causes an explicit provider error. No recommendation uses invented zero weather.

Wind uses the worse of the bounding hourly forecast values for a fractional ETA; at an exact hour it uses that hour. Rain and showers are accumulated over the preceding hour, so the containing hour's end timestamp is selected. Rain + showers in mm is divided by 25.4 to produce in/hr. Snowfall in cm is divided by 2.54; snowfall is not liquid-equivalent precipitation. These are hourly model quantities, not real-time observations. `forecast_time` exposes the hour used.

Coordinates are deduplicated at 0.001 degrees (roughly 100 m). Forecasts use the provider's model grid selection. A projected grid covers locations approximately 20 miles around the union of routes. Cell widths start at 24 km and increase for large bounding areas to bound provider and rendering cost. Every cell contains 49 samples, departure +0 through +48 hours. The slider changes the inspection time only. Changing departure requires submitting a new plan.

The display replaces visible grid rectangles with a bounded inverse-distance weather field. Wind, rain, and snowfall are interpolated independently between supported samples, then classified with the supplied load policy. Exact sample locations retain their original values. Support is limited to twice each sample's projected half-diagonal; the outer edge fades to transparent. The canvas paints at four screen pixels per sample for bounded rendering cost. These display estimates do not alter arrival-based checkpoints, risk mileage, eligibility, or ranking. Interpolation can soften localized extremes; it is not evidence of finer forecast resolution or radar coverage.

Each cached provider response retains its original retrieval timestamp. `sources.forecast_retrieved_at` is the oldest weather-batch retrieval, `forecast_latest_retrieved_at` the newest, and `forecast_cached_batches` the number of cached weather batches used. `generated_at` identifies plan calculation time. None represents the forecast model's issue time. The weather sidebar displays the oldest retrieval and explains caching and manual refresh. Mocked unit-test providers can have null retrieval timestamps; live forecasts cannot silently invent one.

The recommendation explanation compares the winner with the next eligible route and names the first differing ranking criterion and values. Earlier criteria are tied. A sole eligible route and an exact four-criterion tie receive separate explanations. The stable ID is disclosed as the final tie resolver.

## Request example

```json
{
  "origin": {"name": "Chicago, Illinois", "coordinate": [-87.6298, 41.8781]},
  "destination": {"name": "Detroit, Michigan", "coordinate": [-83.0458, 42.3314]},
  "departure": "2026-10-13T18:00:00-05:00",
  "load_lb": 38000,
  "spacing_miles": 25
}
```

Use a departure within the next 72 hours when testing; the example date is illustrative. Coordinates are `[longitude, latitude]`. Accepted locations are bounded to 14–72°N, 168–52°W, with at least 10 miles between endpoints. The bounds are a computational scope, not an assertion of road connectivity. Load must be finite numeric 0–80,000 lb; booleans are rejected. Spacing must be integer 10, 25, or 50.

Response fields are validated in `frontend/src/contracts.ts`. Each route includes geometry, colored road segments, distance, driving duration, arrival, checkpoints and summary; a checkpoint includes miles, coordinate, elapsed seconds, UTC ETA, weather units encoded in field names, forecast hour, and risk with reasons. The response also includes corridor cells and their `[latitude, longitude]` Leaflet rectangle bounds, 49 absolute forecast times, input context, sources, warnings, and recommendation.

Errors use `{"error":{"code":"…","message":"…"}}`: 400 invalid request, 415 unsupported content type, 429 request limit, 502 upstream failure, 503 busy. HTTP method errors use Django's 405. Health checks process liveness only; an upstream outage does not make a healthy process fail liveness.

## Runtime and security scope

Provider URLs are operator-controlled settings, not caller-supplied URLs. User input cannot choose an outbound host. JSON bodies are capped at 8 KiB. City names, coordinate values, departure, load, spacing, trip size, call concurrency, and planning admission are bounded. Up to three plans run concurrently, each with at most three forecast requests in parallel. Individual provider requests have a 20-second socket timeout and an 85-second scheduling deadline; the browser has a 95-second deadline. HTTPX timeouts are socket-operation limits, not a hard cancellation of all server work. Cancelling the browser does not cancel already-running provider calls.

Provider GETs retry at most once for connection errors, read timeouts, remote protocol errors, or HTTP 502/503/504. Each attempt checks the remaining deadline; there is no unbounded retry or backoff loop. HTTP 429, other statuses, malformed JSON, and semantically invalid data are not retried. Diagnostic logs identify the host and failure class without coordinates, full query URLs, or response bodies. Exhausted attempts preserve the existing explicit provider-error behavior.

The server does not trust forwarding headers unless explicitly configured for a trusted ingress. Responses do not include tracebacks or provider tokens. React escapes text; map tooltip text uses DOM textContent. Rate limits and caches are in memory. Multiple replicas need shared ingress limits and deliberate cache policy; those are deferred because this assessment has no deployment scale requirement.
