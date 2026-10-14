# Understanding the application

This is a technical explanation to help you discuss the project in your own words. It is not a recording script.

## The problem and the central idea

A route cannot be judged only by the weather at its origin or departure. A truck may reach a windy section hours later, or after an overnight rest. The application compares three road routes by combining location, estimated arrival, hourly forecasts, and the assessment's weather/load policy. The result is an inspectable recommendation, rather than an unexplained route score.

The intended workflow is a driver or dispatcher reviewing alternatives before departure. This is a planning estimate. It does not replace truck navigation, official road advisories, an ELD, or the driver's judgment.

## What happens after Compare routes

1. React collects selected city coordinates, departure with its timezone, load in pounds, checkpoint spacing, and the break/rest option.
2. Django validates the request, including coordinates, numeric types, departure horizon, and allowed spacing. A calculation cannot start with an ambiguous city string.
3. The provider adapter requests three distinct road options from OSRM, including road geometry and segment distance/time annotations.
4. Geometry code samples each route at the requested mileage intervals, retaining origin and destination. Scheduling adds standard U.S. breaks/rest when enabled.
5. The app builds a separate weather grid around the union of the routes, then requests forecasts for checkpoint, stop, and grid locations.
6. The backend matches weather to checkpoint arrivals and samples weather throughout stops. The policy classifies risk, estimates risk miles, and ranks eligible routes.
7. React validates the response shape with Zod, selects the recommendation, and renders routes, summaries, checkpoint evidence, the field, and playback controls.

Failed requests preserve the previous comparison and form inputs. Changing an input marks the current result as out of date until Compare is pressed again.

## Where the data comes from

OSRM returns road paths based on OpenStreetMap using a car profile. It supplies geography and time estimates; our application does not invent a routing engine. OSRM may return fewer than three natural alternatives. In that case, bounded additional requests use corridor waypoints to obtain distinct real road paths. Those waypoint routes are labelled. If three distinct options cannot be obtained, planning fails explicitly.

This is still car routing. It does not verify truck height, axle/gross weight, hazardous-material restrictions, road closures, or live traffic. The load field changes the supplied weather policy; it does not make OSRM truck-aware.

Open-Meteo supplies hourly wind, rain, showers, and snowfall forecasts. These are online model forecasts, not live roadside measurements or radar. City search also uses Open-Meteo's geocoding service. Leaflet displays OpenStreetMap tiles and our calculated overlays.

Locations are deduplicated to three decimal places for forecast requests, sent in batches of up to 35, with at most three forecast batches in flight. Provider responses are validated for units, numeric values, array alignment, and hourly time spacing. Missing weather never becomes zero rain or an apparently safe route.

## Checkpoints and arrival estimates

Checkpoint spacing follows annotated road distance, rather than drawing a straight line between cities. A 10-mile choice samples more densely than 25 or 50 miles, at greater provider/response cost. The final interval may be shorter; the destination is included exactly.

Timing follows cumulative segment durations. Annotation totals are scaled to preserve the routing provider's complete duration, including turn-cost differences. This is more faithful to the supplied route than assuming constant speed over the entire trip, but it remains an estimate from a car profile.

The scheduling layer adds interruptions before downstream checkpoints. Arrival is departure plus driving time to the point plus stops already completed. A checkpoint exactly at a stop denotes arrival before that stop. The stop has its own arrival, departure, coordinate, and weather assessment.

The backend works in UTC. The browser displays departure and arrival in its labelled device timezone. This prevents the timezone of the server or an intermediate city from silently changing the calculation.

## Breaks, rest, and ELD scope

The default schedule follows the general U.S. property-carrying baseline: a 30-minute non-driving interruption before continuing beyond eight cumulative driving hours, and ten hours off duty before continuing beyond eleven driving hours in a shift. If the destination is reached exactly at a limit, no unnecessary stop is appended after arrival.

For example, twelve driving hours produce twenty-two and a half trip hours: eight hours driving, a half-hour break, three more driving hours, ten hours rest, and the final driving hour. The weather after the rest is therefore checked ten and a half hours later than in a continuous-driving preview.

The model assumes a driver starts with a fresh 11-hour driving allowance and 14-hour duty window, sufficient 60/70-hour cycle availability, and no additional on-duty activities. Under those assumptions, each modeled shift fits the duty window. Actual prior duty, loading, inspections, exceptions, split-sleeper arrangements, weekly-cycle history, and cross-border rules are not evaluated. Ten hours off duty does not reset the weekly cycle. No ELD is connected, so this does not establish compliance for an actual driver.

Stop coordinates are timing estimates on the route, not verified legal or available truck-parking locations. Operational planning would need parking availability and an earlier stop when the next safe facility is before the limit. The optional continuous-driving mode excludes stops and is explicitly not a driver schedule.

The public baseline is documented by [FMCSA](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations). The app's Rules page explains its assumptions alongside the thresholds.

## Weather matching and risk classification

For an arrival between hourly records, wind uses the higher adjacent hourly value. Rain plus showers use the containing end-hour record and are converted from millimeters to inches. Snowfall depth is converted from centimeters to inches. Snowfall is not accumulated road snow. The selected forecast record's time remains inspectable.

Each checkpoint is classified using the worst of wind, rain, and snow. At shared rain/snow boundaries, the implementation chooses the higher category; the precipitation No Travel limits remain strictly greater than their supplied maxima. For example, rain at 0.25 inches/hour is High, rain at exactly 1.00 is Severe, and above 1.00 is No Travel.

The load exceptions are strict: 45–below-55 mph wind with a load above 30,000 lb is No Travel; exactly 30,000 lb remains Severe. At 35–below-45 mph, a load above 40,000 lb raises wind risk to Severe. Wind at or above 55 mph is No Travel for every load. These are assessment rules, not independently validated vehicle-stability models.

During a stop, the backend checks arrival, departure, and intervening hourly boundaries. A No Travel sample at a stop excludes the route even if its driving checkpoints are clear. Parked exposure does not add driven risk miles.

## Risk miles and recommendation

The interval between two checkpoints receives the worse endpoint risk. A 25-mile interval between Low and High is counted as 25 High miles. This is a conservative estimate over sampled endpoints, not proof that all 25 miles have identical weather.

Average risk is weighted by distance. For 25 Moderate miles (ordinal value 1) and 2 Severe miles (value 3), the average is `(25 × 1 + 2 × 3) / 27`, about 1.15. A short final interval does not receive the weight of a full 25-mile interval. The 0–4 categories are ordinal; 1.15 is not a crash probability.

No Travel is a hard exclusion. Eligible routes are compared in order: fewest Severe miles, then fewest High miles, then lowest distance-weighted average risk, then shortest total scheduled travel time, including planned stops. This is lexicographic ordering: later criteria cannot compensate for a worse earlier criterion. A faster route with Severe exposure loses to one without it. Exact ties use a stable route ID. All routes blocked means no recommendation, rather than selecting the least bad blocked route.

The explanation identifies the first criterion separating the winner from the next eligible option. When today's routes are all Low, time may decide. That is a valid result; it does not demonstrate storm avoidance.

## The corridor field and forecast slider

Route checkpoint colors answer a specific question: what conditions are expected when the truck arrives? The corridor field answers a different question: what does the forecast look like across the route area at a selected absolute time?

The backend creates a bounded grid around all route alternatives and preloads 49 times: departure through +48 hours inclusive. The slider changes the displayed time without another provider request. It does not change departure, checkpoint ETAs, or the recommendation. To compare a different departure, edit the trip and run Compare again.

The frontend interpolates underlying wind/rain/snow values across nearby supported samples, then applies the same display policy. Between times it mixes the hourly values. It does not average risk-category numbers to invent a new weather category. Coverage fades outside sample support rather than implying complete geographic knowledge.

The field is visually smooth because samples are interpolated into a canvas. Smooth pixels do not create higher-resolution forecasts or detect unsampled storms. A narrow hazard can still be missed between checkpoints or forecast cells. Route decisions remain backend-owned and are not recalculated from display pixels.

## How simulation works

Playback advances elapsed trip time. The application subtracts completed stop durations to obtain driving time, or holds driving time at the stop boundary while stopped. It locates that driving time among cumulative geometry timestamps and interpolates the position within the correct road segment. This follows road turns rather than jumping along straight lines between checkpoints.

The weather clock continues during stops, so conditions can change while the marker remains stationary. The next High-or-worse warning comes from the original arrival-assessed checkpoints; conditions at the marker are interpolated field estimates. Neither is a new live observation.

Play, pause, seek, reset, speed changes, and replay work entirely from preloaded data. Arrival stops playback. Route changes reset and pause it; Rules navigation and backgrounding pause it. Playback makes no additional forecast requests, and does not refresh old data or represent actual GPS progress.

## Performance and loading feedback

Pixel calculation runs in a Web Worker, leaving the main thread available for input and drawing. Spatial interpolation weights are calculated once per viewport; later time updates reuse them. Pending work is coalesced so old slider positions cannot build an unbounded queue. The canvas is retained across time updates.

Route/checkpoint layers are retained across selection changes. Date formatters are reused, and static route summaries, checkpoint rows, and city inputs avoid repeated creation while time advances. The checkpoint drawer follows pointer movement through animation-frame painting and only commits map layout on release.

Mobile controls use a bottom dock with safe-area spacing and dynamic viewport height. Result sheets are bounded and dismissible. The loading footer keeps the indicator, elapsed seconds, and Cancel reachable. It is indeterminate: there is no trustworthy provider progress percentage or fabricated stage completion.

Motion defaults to the system preference. A browser requesting reduced motion intentionally disables CSS animation. Map settings now provides Full animations as an explicit override, plus Reduced motion. This choice persists locally. Elapsed time and cancellation remain available in all modes. The actual in-app browser reported reduced motion; Full was checked with a deliberately delayed captured-response test, and both spinner rotation and bar position changed between observations.

Local measurements used built React, labelled captured/synthetic plans, and Chrome viewport/CPU emulation. Recent phone-sized playback samples had p95 frame intervals around 17 ms. A stressed desktop sample was slower. These short observations do not establish universal 60 fps, physical-device performance, or field Web Vitals.

## Freshness, reliability, and verification

Forecast responses are cached for ten minutes; routes use a longer cache. The UI exposes forecast retrieval time, with the oldest batch representing the comparison's conservative retrieval timestamp. Retrieval is not the weather model's issue time. An open trip does not automatically refresh. Compare again may still reuse a valid cached forecast.

Provider calls have bounded timeouts, limited retry behavior, a planning deadline, and bounded concurrency. The browser can cancel waiting and has a 95-second timeout. Cancelling the browser does not guarantee that work already running in Django or an upstream service stops immediately. These limits and caches are process-local, which is why the assessment deployment uses one instance.

Verification has distinct purposes. The backend/frontend/Worker tests check implementation boundaries. Twelve manually specified scenarios and 500 weather/load combinations check expected policy behavior. Three deliberate mistakes test whether the checks can catch selected defects. Provider recordings replay with HTTP disabled to detect integration regressions. Browser checks exercise interaction, errors, keyboard controls, responsive layouts, temporal storms, reduced motion, and emulated GPS.

Separate live comparisons confirm the APIs can work together at a moment in time. They do not prove forecast accuracy, travel-time accuracy, improved fleet outcomes, or availability guarantees. Historical weather observations, real trip traces, missed-hazard/false-alert measurements, and driver-specific duty data would be needed for those stronger claims.

## Architecture and deployment

React/TypeScript owns interaction and Leaflet rendering. Django owns validation, providers, geometry, scheduling, classification, and ranking. Zod checks the response contract before displaying it. Provider adapters are separate from policy so upstream changes and domain rules can be tested independently.

Django now persists completed comparisons in SQLite using Trip, Route, and Checkpoint models. A saved link restores the original forecasts and results without provider calls; links expire after seven days. Anyone with the unlisted link can view that comparison. There are no user accounts or duty records, and durable hosting requires a persistent volume. Appearance/motion preferences are stored locally; device coordinates are not persisted or sent to the planner API. GPS is opt-in and separate from the simulation.

Railway is prepared to build with Railpack using Python 3.13 and Node 24. One Waitress service serves built React and the Django API, with WhiteNoise for static assets. Same-origin delivery avoids a separate frontend/API CORS configuration. No local Docker is required. CI verifies builds, types, lint, tests, native startup, and HTTP/static smoke behavior. A public Railway runtime still needs deployment and external verification.

There is no trained model or LLM. The recommendation is a deterministic rule engine implementing the supplied policy. Adding a model would require a defined prediction task, representative data, independent evaluation, and a decision about whether it may influence route selection. A model label would not improve this version's correctness.

The concise explanation is: the app joins road location and arrival time with forecast weather, applies explicit risk/load rules, and makes the recommendation traceable to those inputs. Its next operational improvements are truck-aware routes, actual duty records and parking data, and real-world evaluation.
