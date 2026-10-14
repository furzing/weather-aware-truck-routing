# Seven-minute assessment walkthrough

This script follows `E:/spotter/fs-assessment-spotter.md`. Its stated evaluation weights are 40% routes/weather/risk/recommendation, 35% UI/map/heatmap smoothness and performance, 10% code quality, and 5% documentation/walkthrough. They total 90%; the file does not specify the remaining 10%. The required Loom is 5–10 minutes. It explicitly prioritizes correctness and clarity over extra features.

Rehearse with a timer. The narration leaves space for screen actions; pause to let the reviewer read the relevant value. Target 6:50–7:00. Do not fill time with installation, long scrolling, or optional settings.

## Prepare

- Open the app, `backend/routing/risk.py`, the scenario report, README, and the passing GitHub Actions run in separate tabs. Keep code and browser text readable; close private tabs and credentials.
- Use Chicago → Detroit, departure about one hour ahead, 38,000 lb, and 25-mile checkpoints. Select unambiguous city results. Have a successful comparison ready and check provider availability before recording.
- Run `.\.venv\Scripts\python scripts\evaluate_scenarios.py` beforehand; open `output/scenario-evaluation.json`. These are synthetic policy checks. Do not present them as live storm measurements.
- Prepare a phone-sized browser viewport around 390×844 for a short responsive demonstration.
- The app is currently local and Railway deployment is prepared. Record the final submission against the hosted URL after deployment and public smoke checks. Ensure reviewers can access the private repository. A guide is not evidence of a completed recording or public deployment.

## 0:00–0:25 — Explain the workflow

**Show:** Planner, map, and trip inputs.

**Say:**

> This is a weather-aware route comparison tool for a driver or dispatcher. It compares three road routes using departure time, load weight, and the weather expected when the truck reaches each checkpoint. I'll show the workflow, explain the recommendation, and show the evidence behind the calculations.

## 0:25–1:25 — Generate three routes

**Show:** Origin and destination, labelled departure timezone, load, and the 10/25/50-mile spacing choices. Keep 25 selected and press Compare. Show the three route summaries and deciding recommendation criterion.

**Say:**

> These inputs match the assessment: origin, destination, departure, and load. Checkpoint spacing can be ten, twenty-five, or fifty miles. OSRM provides road routes, and Open-Meteo provides hourly weather forecasts. The backend uses road-segment travel times to estimate arrival at each checkpoint, then evaluates weather at that arrival time, rather than applying departure weather to the entire trip.
>
> Each option shows distance, driving time, and risk exposure. The recommendation explains which criterion decided the comparison.

If every route is Low, add: “Here, the weather criteria tie, so total scheduled travel time decides.” Do not claim the current example demonstrates storm avoidance. If a corridor waypoint is labelled, identify it as a real road route requested via that waypoint.

## 1:25–2:15 — Inspect the map and checkpoints

**Show:** Select a different route. Open Checkpoints, click one to locate it on the map, and open its risk explanation. Resize the drawer, close it, and use Fit routes. Let the map settle.

**Say:**

> All three routes remain visible, and selecting one emphasizes it. Checkpoints expose arrival time, wind, rain, snow, and the resulting risk, so the user can inspect the evidence behind the summary.
>
> The drawer opens on demand and can be resized or dismissed. During dragging, it follows the pointer while the map keeps its size; releasing commits the new map space once. This avoids resizing the map and redrawing its weather field for every pointer movement.

## 2:15–3:05 — Demonstrate the heatmap and time

**Show:** Open Weather; move from departure to +24 and +48 hours. Point to the legend and retrieval time. Start Simulate drive, pause, seek, then close playback.

**Say:**

> The corridor heatmap covers departure through the next forty-eight hours. The slider updates preloaded data without making another forecast request. It changes the time being inspected; checkpoint risk and the recommendation remain tied to the planned arrival times.
>
> Playback moves the truck along road geometry using segment timings, while forecast time advances with it. The preview includes planned U.S. breaks and rest, holding the truck while forecast time advances. Actual duty records, traffic, and parking availability are not evaluated. The smooth field interpolates forecast samples; it doesn't increase the weather model's resolution. Forecasts are cached for ten minutes, and an open trip doesn't automatically refresh.

## 3:05–3:40 — Show mobile behavior

**Show:** Switch to the prepared mobile viewport. Open Routes and select one so the sheet closes. Open and dismiss Weather. Open Checkpoints and drag it down. Restore desktop size.

**Say:**

> On mobile, the main controls move to a bottom dock with safe-area spacing. Routes and Weather use bounded sheets, and selecting a route dismisses the sheet. Checkpoints can be dragged down to restore map space. This demonstrates the responsive browser layout; physical phone toolbar and GPS behavior still need verification on the public deployment.

## 3:40–4:35 — Explain the exact risk policy

**Show:** Rules: threshold table and recommendation order. Point to the load rules. Keep ELD/HOS discussion brief.

**Say:**

> The worst category across wind, rain, and snow determines checkpoint risk. Load adds the specified wind restrictions. At forty-five miles per hour, a thirty-thousand-pound load remains Severe, while thirty-thousand-and-one becomes No Travel. Wind at or above fifty-five means No Travel for every load.
>
> No Travel excludes a route. Eligible routes are ordered by Severe miles, High miles, distance-weighted average risk, then total scheduled travel time. If all routes are excluded, the app gives no recommendation.
>
> Between checkpoints, the worse endpoint estimates interval risk mileage. This remains sampled evidence: a narrow hazard can fall between checkpoints. Rules also explains HOS considerations, but no ELD is connected and no driver's available duty hours are evaluated.

## 4:35–5:30 — Show verification and recovery

**Show:** Passing CI and the prepared scenario report. Point to `severe_before_time`, `load_exact_30000`, and `all_blocked_different_causes`, then the detected mutations. Briefly return to the app, edit a city without selecting a result, press Compare, and show its validation message. Select the result to correct it; a second full comparison is unnecessary.

**Say:**

> Verification includes backend, frontend, and Worker tests, including break boundaries and weather during rest. Separate evaluation checks twelve manually specified scenarios and five hundred weather-and-load combinations. It also catches three deliberately introduced mistakes, including putting time before weather and mishandling load boundaries.
>
> Invalid locations produce an actionable correction while preserving inputs. Missing upstream weather produces an explicit error, never an apparently safe fallback. Recorded provider responses can be replayed with HTTP disabled to detect integration regressions. These checks establish implementation behavior, not forecast accuracy or real-world safety outcomes.

## 5:30–6:20 — Show code quality

**Show:** Repository structure, then the short `classify`, `priority`, and `recommendation` functions in `backend/routing/risk.py`. Briefly point to `geometry.py`, `providers.py`, and `service.py` in the tree. Show CI's build/container smoke steps rather than scrolling logs.

**Say:**

> React and TypeScript handle map interaction; Django owns provider validation, checkpoint timing, risk calculation, and ranking. The policy is separate from geometry and provider adapters, making those boundaries easier to test. Input and provider errors are explicit.
>
> Recommendations are deterministic: there is no trained model or LLM. The supplied policy is implemented directly so decisions are auditable. CI checks tests, formatting, types, and builds, and also builds the deployment container and smoke-tests its HTTP and static delivery.

## 6:20–7:00 — Finish with a reproducible handoff

**Show:** README setup and verification commands, documented limitations, and actual hosted URL after deployment.

**Say:**

> The README provides setup, verification, architecture, and deployment instructions. The main limits are car-profile routing, forecast uncertainty, and assumed fresh duty clocks and estimated stop locations. Before operational trucking use, the priorities are truck-capable routing, integration with actual duty records and parking data, and evaluation against observed weather and real trip traces.
>
> The result is an inspectable route comparison: the user can see the forecast, the rule it triggered, and why one route ranks ahead of another.

## Recording guardrails

- GPS and night mode are secondary; omit their tours unless the core demonstration finishes early.
- Say “hourly forecast,” “lower risk under the supplied policy,” and “ELD/HOS guidance.” Avoid “real-time roadside weather,” “guaranteed safest,” “trained AI prediction,” or “ELD compliant.”
- Label captured responses, synthetic storms, and emulated GPS if shown. Do not induce a live provider outage or wait for an entire test suite during the recording.
- Browser interaction checks passed, but no physical-device frame-rate benchmark was performed. Demonstrate smoothness; do not invent performance scores or claim testing on every phone.
- Only call Railway live after deployment and public verification. A private repository also needs reviewer access before submission.
