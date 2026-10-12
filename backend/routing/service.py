from datetime import timedelta

from .geometry import checkpoints, corridor
from .providers import ProviderError, Providers, location_key, weather_at
from .risk import classify, recommendation, summarize


def build_plan(data):
    provider = Providers()
    try:
        raw_routes = provider.routes(
            data["origin"]["coordinate"], data["destination"]["coordinate"]
        )
        cells = corridor(raw_routes)
        sampled = [checkpoints(r, data["spacing_miles"]) for r in raw_routes]
        forecasts = provider.forecasts(
            [p["coordinate"] for route in sampled for p in route] + [c["coordinate"] for c in cells]
        )
        routes = []
        for i, (raw, points) in enumerate(zip(raw_routes, sampled)):
            for p in points:
                eta = data["departure"] + timedelta(seconds=p["elapsed_s"])
                weather = weather_at(forecasts[location_key(p["coordinate"])], eta)
                p.update(
                    eta=eta.isoformat(),
                    weather=weather,
                    risk=classify(
                        weather["wind_mph"], weather["rain_in"], weather["snow_in"], data["load_lb"]
                    ),
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
                    "segments": segments,
                    "distance_miles": raw["distance"] / 1609.344,
                    "duration_s": raw["duration"],
                    "arrival": points[-1]["eta"],
                    "checkpoints": points,
                    "summary": summarize(points, raw["duration"]),
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
            "recommendation_reason": "Lowest Severe miles, then High miles, distance-weighted average risk, then driving time. Routes with No Travel checkpoints are excluded."
            if recommended
            else "Every route includes No Travel conditions. Delay departure and check again.",
            "corridor": cells,
            "forecast_hours": hours,
            "departure": data["departure"].isoformat(),
            "origin": data["origin"],
            "destination": data["destination"],
            "load_lb": data["load_lb"],
            "spacing_miles": data["spacing_miles"],
            "sources": {
                "routing": "OSRM / OpenStreetMap (car profile)",
                "weather": "Open-Meteo",
                "forecast_locations": len(forecasts),
            },
            "warnings": [
                "Assessment planning tool. Routes do not check truck height, road restrictions, traffic, rest stops, or hours of service.",
                "Risk miles estimate conditions between checkpoints using the worse endpoint. Forecast grid cells are samples, not radar.",
            ],
        }
    except (KeyError, TypeError, ValueError, IndexError, ZeroDivisionError) as exc:
        raise ProviderError(
            "A provider returned an unexpected response. Please retry; no recommendation was made."
        ) from exc
    finally:
        provider.close()
