# 7-minute walkthrough outline

Record yourself explaining the running application and code. Replace the local URL with the hosted URL before submission. This is an outline, not a completed Loom recording.

**0:00–0:45 — Task and scope.** “This helps a driver or dispatcher compare three routes by the supplied weather and load policy. Weather is sampled at arrival, not just departure.” Point out the visible truck-navigation limitation and the labelled timezone.

**0:45–2:00 — Plan a trip.** Use Chicago → Detroit, departure about one hour ahead, 38,000 lb, 25-mile spacing. Search for a city and select its state/country result. Compare. Explain the three genuine road routes, the labelled corridor waypoint if present, driving time, distance, and recommendation.

**2:00–3:00 — Inspect the evidence.** Select another route, show that the map and checkpoint table update, and click a checkpoint to locate it. Open a risk explanation. Show differing ETAs between checkpoints. Explain that road-segment timings, not constant route speed, determine arrivals.

**3:00–3:45 — Forecast corridor.** Move the slider from 0 to 24 to 48 and toggle the weather layer. Explain that cells show weather at that absolute time across the corridor; road risk remains tied to checkpoint ETAs. The slider uses preloaded data. Do not claim there is severe weather if today's forecast is Low.

**3:45–5:00 — Policy correctness.** Open `backend/routing/risk.py` and the relevant test cases. Explain 45 mph + 30,001 lb → No Travel, but 30,000 lb → Severe; 35 mph + 40,001 lb → Severe. Explain that No Travel excludes a route and all blocked routes produce no recommendation. Explain the lexicographic Severe → High → average → time ordering. Show the tests rather than representing synthetic high-wind conditions as a live forecast.

**5:00–5:45 — Failure and recovery.** Edit a city without selecting a result, then compare. Show the actionable message and preserved inputs. Explain that upstream missing forecasts produce an error, never zero risk. Restore the trip and compare again. Change checkpoint spacing and explain the sampling tradeoff.

**5:45–6:30 — Architecture and tests.** Show React/TypeScript, Django, domain policy, provider adapter, and lockfiles. Run the verification commands in the README. Briefly show the automated browser check and the live smoke response. Distinguish deterministic tests from live provider evidence.

**6:30–7:00 — Decisions and next steps.** Mention car-profile routing, estimated between-checkpoint risk, forecast uncertainty, and provider service limits. Explain the single-origin deployment and health endpoint. A production trucking workflow would need truck-capable routing, operational advisories, and realistic duty/rest times.

Simple explanation: “We compare the weather the truck is expected to encounter along each road route. We rule out No Travel conditions, reduce severe exposure first, and use driving time to break the remaining ties.”
