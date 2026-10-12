import bisect
import hashlib
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx
from django.conf import settings
from django.core.cache import cache

from .geometry import distance


class ProviderError(Exception):
    pass


class Providers:
    def __init__(self):
        self.deadline = time.monotonic() + 85
        self.client = httpx.Client(
            headers={"User-Agent": "WeatherAwareTruckRouting/1.0 assessment"},
            timeout=20,
            follow_redirects=False,
        )

    def close(self):
        self.client.close()

    def get(self, url, params, ttl=600):
        key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
        cached = cache.get(key)
        if cached is not None:
            return cached
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise ProviderError(
                "The planning deadline was reached. Please retry with a shorter trip."
            )
        try:
            response = self.client.get(url, params=params, timeout=min(20, remaining))
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError(
                "A routing or forecast service is unavailable. Please retry shortly."
            ) from exc
        cache.set(key, data, ttl)
        return data

    def places(self, query):
        data = self.get(
            settings.GEOCODING_URL,
            {"name": query, "count": 10, "language": "en", "format": "json"},
            86400,
        )
        if not isinstance(data, dict) or not isinstance(data.get("results", []), list):
            raise ProviderError("City search returned an unexpected response.")
        for p in data.get("results", []):
            if (
                not isinstance(p, dict)
                or not isinstance(p.get("name"), str)
                or any(
                    type(p.get(key)) not in (int, float) or not math.isfinite(p[key])
                    for key in ("latitude", "longitude")
                )
            ):
                raise ProviderError("City search returned incomplete locations.")
        return [
            {
                "name": ", ".join(
                    dict.fromkeys(filter(None, (p["name"], p.get("admin1"), p.get("country"))))
                ),
                "longitude": p["longitude"],
                "latitude": p["latitude"],
            }
            for p in data.get("results", [])
            if p.get("country_code") in ("US", "CA", "MX")
        ]

    def routes(self, origin, destination):
        def request(points, alternatives):
            coords = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in points)
            data = self.get(
                f"{settings.OSRM_URL}/route/v1/driving/{coords}",
                {
                    "alternatives": alternatives,
                    "overview": "full",
                    "geometries": "geojson",
                    "annotations": "distance,duration",
                    "steps": "false",
                },
                3600,
            )
            if data.get("code") != "Ok" or not data.get("routes"):
                raise ProviderError("No drivable route was found between these locations.")
            return data["routes"]

        candidates = request([origin, destination], "2")
        routes = []

        def add(candidate, note):
            # Alternative routes must differ beyond a tiny endpoint variation.
            if any(
                abs(candidate["distance"] - r["distance"]) < 500
                and abs(candidate["duration"] - r["duration"]) < 60
                for r in routes
            ):
                return
            candidate["via_note"] = note
            routes.append(candidate)

        for candidate in candidates:
            add(candidate, "Routing service alternative")
        if len(routes) < 3:
            # OSRM alternatives are not guaranteed. Ask the same routing API for
            # real road routes through two lateral corridor waypoints.
            dx, dy = destination[0] - origin[0], destination[1] - origin[1]
            norm = math.hypot(dx, dy)
            offset = min(0.8, max(0.15, norm * 0.12))
            for sign in (1, -1, 2, -2):
                if len(routes) >= 3:
                    break
                via = [
                    (origin[0] + destination[0]) / 2 - sign * dy / norm * offset,
                    (origin[1] + destination[1]) / 2 + sign * dx / norm * offset,
                ]
                try:
                    extra = request([origin, via, destination], "false")
                except ProviderError:
                    continue
                add(extra[0], "Via a corridor waypoint to provide a distinct alternative")
        if len(routes) < 3:
            raise ProviderError(
                "The routing service could not find three distinct alternatives. Try different cities."
            )
        routes = sorted(routes[:3], key=lambda r: r["duration"])
        if any(r["distance"] > 2_414_016 or r["duration"] > 48 * 3600 for r in routes):
            raise ProviderError(
                "Choose a trip with all alternatives under 1,500 miles and 48 driving hours."
            )
        for r in routes:
            if (
                distance(origin, r["geometry"]["coordinates"][0]) > 10_000
                or distance(destination, r["geometry"]["coordinates"][-1]) > 10_000
            ):
                raise ProviderError(
                    "A location is more than 6 miles from a routable road. Choose a nearby city."
                )
        return routes

    def forecasts(self, points):
        unique = list(dict.fromkeys(location_key(p) for p in points))
        chunks = [unique[i : i + 35] for i in range(0, len(unique), 35)]

        def fetch(chunk):
            data = self.get(
                settings.WEATHER_URL,
                {
                    "latitude": ",".join(str(p[1]) for p in chunk),
                    "longitude": ",".join(str(p[0]) for p in chunk),
                    "hourly": "wind_speed_10m,rain,showers,snowfall",
                    "wind_speed_unit": "mph",
                    "precipitation_unit": "mm",
                    "timeformat": "unixtime",
                    "timezone": "GMT",
                    "forecast_days": 7,
                },
            )
            rows = data if isinstance(data, list) else [data]
            if len(rows) != len(chunk):
                raise ProviderError(
                    "The forecast service returned incomplete locations. Please retry."
                )
            parsed = {}
            for point, row in zip(chunk, rows):
                expected_units = {
                    "wind_speed_10m": "mp/h",
                    "rain": "mm",
                    "showers": "mm",
                    "snowfall": "cm",
                    "time": "unixtime",
                }
                if not isinstance(row, dict) or any(
                    row.get("hourly_units", {}).get(k) != v for k, v in expected_units.items()
                ):
                    raise ProviderError("Forecast units changed; no route recommendation was made.")
                hourly = row.get("hourly", {})
                fields = ("time", "wind_speed_10m", "rain", "showers", "snowfall")
                if (
                    any(not isinstance(hourly.get(f), list) for f in fields)
                    or len(hourly["time"]) < 49
                    or any(len(hourly[f]) != len(hourly["time"]) for f in fields)
                ):
                    raise ProviderError(
                        "Forecast data is incomplete; no route recommendation was made."
                    )
                if any(
                    type(t) not in (int, float) or not math.isfinite(t) for t in hourly["time"]
                ) or any(b - a != 3600 for a, b in zip(hourly["time"], hourly["time"][1:])):
                    raise ProviderError(
                        "Forecast hours are invalid; no route recommendation was made."
                    )
                parsed[point] = hourly
            return parsed

        with ThreadPoolExecutor(max_workers=3) as pool:
            batches = list(pool.map(fetch, chunks))
        return {key: value for batch in batches for key, value in batch.items()}


def location_key(point):
    return (round(point[0], 3), round(point[1], 3))


def weather_at(hourly, moment):
    timestamp = moment.timestamp()
    times = hourly["time"]
    if timestamp < times[0] or timestamp > times[-1]:
        raise ProviderError(
            "The trip extends beyond the available forecast. Choose an earlier departure."
        )
    upper = bisect.bisect_left(times, timestamp)
    lower = max(0, upper - 1) if times[upper] != timestamp else upper
    values = [
        hourly["wind_speed_10m"][lower],
        hourly["wind_speed_10m"][upper],
        hourly["rain"][upper],
        hourly["showers"][upper],
        hourly["snowfall"][upper],
    ]
    if any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in values):
        raise ProviderError("Weather is missing at a checkpoint; no route recommendation was made.")
    return {
        "wind_mph": max(values[:2]),
        "rain_in": (values[2] + values[3]) / 25.4,
        "snow_in": values[4] / 2.54,
        "forecast_time": datetime.fromtimestamp(times[upper], timezone.utc).isoformat(),
    }
