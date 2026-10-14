from datetime import datetime, timedelta, timezone

from .geometry import checkpoints, corridor, geometry_elapsed
from .providers import ProviderError, Providers, location_key, weather_at
from .risk import classify, explain_recommendation, recommendation, summarize
from .schedule import PlanningLimitError, arrival_elapsed, planned_stops


def build_plan(data):
    provider = Providers()
    try:
        raw_routes = provider.routes(
            data["origin"]["coordinate"], data["destination"]["coordinate"]
        )
        cells = corridor(raw_routes)
        sampled = [checkpoints(r, data["spacing_miles"]) for r in raw_routes]
        schedules = [planned_stops(r, data.get("schedule_breaks", True)) for r in raw_routes]
        forecasts = provider.forecasts(
            [p["coordinate"] for route in sampled for p in route]
            + [s["coordinate"] for stops in schedules for s in stops]
            + [c["coordinate"] for c in cells]
        )
        routes = []
        for i, (raw, points) in enumerate(zip(raw_routes, sampled)):
            stops = schedules[i]
            for p in points:
                p["driving_elapsed_s"] = p["elapsed_s"]
                p["elapsed_s"] = arrival_elapsed(p["elapsed_s"], stops)
                eta = data["departure"] + timedelta(seconds=p["elapsed_s"])
                weather = weather_at(forecasts[location_key(p["coordinate"])], eta)
                p.update(
                    eta=eta.isoformat(),
                    weather=weather,
                    risk=classify(
                        weather["wind_mph"], weather["rain_in"], weather["snow_in"], data["load_lb"]
                    ),
                )
            for stop in stops:
                start = data["departure"] + timedelta(seconds=stop["start_elapsed_s"])
                end = data["departure"] + timedelta(seconds=stop["end_elapsed_s"])
                # Include both endpoints and every hourly boundary during a stop.
                at = start.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
                samples = [start, end]
                while at < end:
                    samples.append(at)
                    at += timedelta(hours=1)
                assessed = []
                for at in samples:
                    weather = weather_at(forecasts[location_key(stop["coordinate"])], at)
                    assessed.append(
                        {
                            "at": at.isoformat(),
                            "weather": weather,
                            "risk": classify(
                                weather["wind_mph"],
                                weather["rain_in"],
                                weather["snow_in"],
                                data["load_lb"],
                            ),
                        }
                    )
                worst = max(assessed, key=lambda item: item["risk"]["level"])
                stop.update(
                    arrival=start.isoformat(),
                    departure=end.isoformat(),
                    weather=worst["weather"],
                    risk=worst["risk"],
                    weather_samples=assessed,
                )
            summary = summarize(points, raw["duration"])
            if stops:
                summary["max_risk"] = max(summary["max_risk"], *(s["risk"]["level"] for s in stops))
                summary["eligible"] = summary["eligible"] and all(
                    s["risk"]["level"] < 4 for s in stops
                )
            segments = [
                {
                    "coordinates": [
                        a["coordinate"],
                        *raw["geometry"]["coordinates"][
                            a["geometry_index"] + 1 : b["geometry_index"] + 1
                        ],
                        b["coordinate"],
                    ],
                    "level": max(a["risk"]["level"], b["risk"]["level"]),
                }
                for a, b in zip(points, points[1:])
            ]
            for p in points:
                del p["geometry_index"]
            routes.append(
                {
                    "id": f"route-{i + 1}",
                    "name": f"Route {i + 1}",
                    "via_note": raw["via_note"],
                    "geometry": raw["geometry"],
                    "geometry_elapsed_s": geometry_elapsed(raw),
                    "segments": segments,
                    "distance_miles": raw["distance"] / 1609.344,
                    "duration_s": raw["duration"],
                    "stop_duration_s": sum(s["duration_s"] for s in stops),
                    "total_duration_s": raw["duration"] + sum(s["duration_s"] for s in stops),
                    "stops": stops,
                    "arrival": points[-1]["eta"],
                    "checkpoints": points,
                    "summary": summary,
                }
            )
        hours = [(data["departure"] + timedelta(hours=h)).isoformat() for h in range(49)]
        for c in cells:
            hourly = forecasts[location_key(c["coordinate"])]
            c["hours"] = []
            for h in range(49):
                weather = weather_at(hourly, data["departure"] + timedelta(hours=h))
                c["hours"].append(
                    {
                        **weather,
                        "level": classify(
                            weather["wind_mph"],
                            weather["rain_in"],
                            weather["snow_in"],
                            data["load_lb"],
                        )["level"],
                    }
                )
        recommended = recommendation(routes)
        return {
            "routes": routes,
            "recommended_id": recommended,
            "recommendation_reason": explain_recommendation(routes),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "corridor": cells,
            "forecast_hours": hours,
            "departure": data["departure"].isoformat(),
            "origin": data["origin"],
            "destination": data["destination"],
            "load_lb": data["load_lb"],
            "spacing_miles": data["spacing_miles"],
            "schedule_breaks": data.get("schedule_breaks", True),
            "sources": {
                "routing": "OSRM / OpenStreetMap (car profile)",
                "weather": "Open-Meteo",
                "forecast_locations": len(forecasts),
                "forecast_retrieved_at": min(provider.forecast_fetch_times, default=None),
                "forecast_latest_retrieved_at": max(provider.forecast_fetch_times, default=None),
                "forecast_cached_batches": provider.forecast_cache_hits,
            },
            "warnings": [
                "Assessment planning tool. Car-profile routes do not check truck restrictions, parking availability, or traffic.",
                "Scheduled U.S. breaks/rest assume a fresh 11-hour/14-hour shift and sufficient 60/70-hour cycle availability. No ELD clocks, prior duty, loading, inspections, exceptions, or cross-border rules are evaluated. Stop locations are estimates, not verified parking."
                if data.get("schedule_breaks", True)
                else "Continuous-driving preview: breaks and rest are excluded. Do not use these arrival estimates as a driver schedule.",
                "Risk miles estimate conditions between checkpoints using the worse endpoint. Forecast grid cells are samples, not radar.",
            ],
        }
    except PlanningLimitError:
        raise
    except (KeyError, TypeError, ValueError, IndexError, ZeroDivisionError) as exc:
        raise ProviderError(
            "A provider returned an unexpected response. Please retry; no recommendation was made."
        ) from exc
    finally:
        provider.close()
