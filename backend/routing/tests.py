import json
import math
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase

from .geometry import checkpoints
from .providers import ProviderError, Providers, weather_at
from .risk import classify, recommendation, summarize
from .views import validate


def trip():
    return {
        "origin": {"name": "Chicago", "coordinate": [-87.63, 41.88]},
        "destination": {"name": "Detroit", "coordinate": [-83.05, 42.33]},
        "departure": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "load_lb": 38_000,
        "spacing_miles": 25,
    }


def road():
    return {
        "geometry": {"type": "LineString", "coordinates": [[-88, 42], [-87, 42], [-86, 42]]},
        "distance": 160_934.4,
        "duration": 7200,
        "via_note": "Routing service alternative",
        "legs": [{"annotation": {"distance": [80_467.2, 80_467.2], "duration": [1800, 5400]}}],
    }


def forecast(wind=10):
    start = (
        datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    )
    return {
        "time": [start + i * 3600 for i in range(168)],
        "wind_speed_10m": [wind] * 168,
        "rain": [0] * 168,
        "showers": [0] * 168,
        "snowfall": [0] * 168,
    }


class RiskTests(SimpleTestCase):
    def test_all_threshold_edges_and_strict_no_travel(self):
        for wind, expected in [
            (0, 0),
            (24.999, 0),
            (25, 1),
            (34.999, 1),
            (35, 2),
            (44.999, 2),
            (45, 3),
            (54.999, 3),
            (55, 4),
            (100, 4),
        ]:
            with self.subTest(wind=wind):
                self.assertEqual(classify(wind, 0, 0, 0)["level"], expected)
        for rain, expected in [
            (0.0999, 0),
            (0.1, 1),
            (0.2499, 1),
            (0.25, 2),
            (0.4999, 2),
            (0.5, 3),
            (1, 3),
            (1.0001, 4),
        ]:
            with self.subTest(rain=rain):
                self.assertEqual(classify(0, rain, 0, 0)["level"], expected)
        for snow, expected in [
            (0.499, 0),
            (0.5, 1),
            (0.999, 1),
            (1, 2),
            (1.999, 2),
            (2, 3),
            (3, 3),
            (3.001, 4),
        ]:
            with self.subTest(snow=snow):
                self.assertEqual(classify(0, 0, snow, 0)["level"], expected)

    def test_load_boundaries_use_strict_greater_than(self):
        for wind, load, expected in [
            (45, 30000, 3),
            (45, 30001, 4),
            (54.9, 30001, 4),
            (35, 40000, 2),
            (35, 40001, 3),
            (44.9, 40001, 3),
            (34.9, 80000, 1),
            (55, 0, 4),
        ]:
            with self.subTest(wind=wind, load=load):
                self.assertEqual(classify(wind, 0, 0, load)["level"], expected)

    def test_highest_condition_wins_and_missing_is_never_low(self):
        self.assertEqual(classify(10, 0.2, 2.1, 0)["level"], 3)
        for bad in [math.nan, math.inf, -1]:
            with self.assertRaises(ValueError):
                classify(bad, 0, 0, 0)

    def test_miles_conserved_and_short_last_interval_is_weighted(self):
        points = [
            {"mile": 0, "risk": {"level": 0}},
            {"mile": 25, "risk": {"level": 1}},
            {"mile": 27, "risk": {"level": 3}},
        ]
        summary = summarize(points, 1000)
        self.assertEqual(summary["risk_miles"]["Moderate"], 25)
        self.assertEqual(summary["risk_miles"]["Severe"], 2)
        self.assertAlmostEqual(sum(summary["risk_miles"].values()), 27)
        self.assertAlmostEqual(summary["average_risk"], 31 / 27)

    def test_recommendation_lexicographic_order(self):
        def route(id, severe=0, high=0, average=0, time=100, eligible=True):
            return {
                "id": id,
                "summary": {
                    "eligible": eligible,
                    "risk_miles": {"Severe": severe, "High": high},
                    "average_risk": average,
                    "duration_s": time,
                },
            }

        cases = [
            [route("safer", severe=0, high=100, time=500), route("faster", severe=1, time=1)],
            [route("safer", high=0, average=2), route("faster", high=1)],
            [route("safer", average=1, time=500), route("faster", average=2, time=1)],
            [route("safer", time=10), route("faster", time=20)],
            [route("safer", severe=100), route("blocked", eligible=False)],
        ]
        for routes in cases:
            self.assertEqual(recommendation(routes), "safer")
        self.assertIsNone(recommendation([route("blocked", eligible=False)]))


class SamplingTests(SimpleTestCase):
    def test_zero_length_endpoint_segments_preserve_departure_and_arrival(self):
        raw = road()
        raw["geometry"]["coordinates"] = [[-88, 42], [-88, 42], [-87, 42], [-86, 42], [-86, 42]]
        raw["legs"][0]["annotation"] = {
            "distance": [0, 80_467.2, 80_467.2, 0],
            "duration": [30, 1770, 5370, 30],
        }
        points = checkpoints(raw, 25)
        self.assertEqual(points[0]["elapsed_s"], 0)
        self.assertEqual(points[-1]["elapsed_s"], 7200)
        self.assertEqual(points[-1]["coordinate"], [-86, 42])

    def test_segment_time_not_uniform_route_speed(self):
        points = checkpoints(road(), 25)
        self.assertEqual([round(p["mile"]) for p in points], [0, 25, 50, 75, 100])
        self.assertAlmostEqual(points[2]["elapsed_s"], 1800)
        self.assertAlmostEqual(points[3]["elapsed_s"], 4500)
        self.assertEqual(points[0]["coordinate"], [-88, 42])
        self.assertEqual(points[-1]["coordinate"], [-86, 42])
        self.assertAlmostEqual(points[-1]["elapsed_s"], 7200)

    def test_all_intervals_and_final_partial(self):
        raw = road()
        raw["distance"] = 101 * 1609.344
        for spacing, count in [(10, 12), (25, 6), (50, 4)]:
            points = checkpoints(raw, spacing)
            self.assertEqual(len(points), count)
            self.assertAlmostEqual(points[-1]["mile"], 101)
            self.assertTrue(
                all(b["elapsed_s"] >= a["elapsed_s"] for a, b in zip(points, points[1:]))
            )
            self.assertTrue(
                all(0 < b["mile"] - a["mile"] <= spacing + 1e-8 for a, b in zip(points, points[1:]))
            )

    def test_misaligned_annotations_fail(self):
        raw = road()
        raw["legs"][0]["annotation"]["duration"].pop()
        with self.assertRaises(ValueError):
            checkpoints(raw, 25)


class WeatherTests(SimpleTestCase):
    def test_forecast_units_and_hourly_contract(self):
        row = {
            "hourly": forecast(),
            "hourly_units": {
                "time": "unixtime",
                "wind_speed_10m": "mp/h",
                "rain": "mm",
                "showers": "mm",
                "snowfall": "cm",
            },
        }
        provider = Providers()
        try:
            with patch.object(provider, "get", return_value=row):
                self.assertEqual(len(provider.forecasts([[-87, 42]])), 1)
                row["hourly_units"]["snowfall"] = "inch"
                with self.assertRaises(ProviderError):
                    provider.forecasts([[-87, 42]])
                row["hourly_units"]["snowfall"] = "cm"
                row["hourly"]["time"][1] = row["hourly"]["time"][0]
                with self.assertRaises(ProviderError):
                    provider.forecasts([[-87, 42]])
        finally:
            provider.close()

    def test_hour_selection_and_independent_unit_conversion(self):
        hourly = {
            "time": [0, 3600, 7200],
            "wind_speed_10m": [20, 40, 10],
            "rain": [0, 5.08, 0],
            "showers": [0, 7.62, 0],
            "snowfall": [0, 2.54, 0],
        }
        weather = weather_at(hourly, datetime.fromtimestamp(1800, timezone.utc))
        self.assertEqual(weather["wind_mph"], 40)
        self.assertAlmostEqual(weather["rain_in"], 0.5)
        self.assertAlmostEqual(weather["snow_in"], 1)
        self.assertEqual(weather["forecast_time"], "1970-01-01T01:00:00+00:00")
        self.assertEqual(
            weather_at(hourly, datetime.fromtimestamp(7200, timezone.utc))["wind_mph"], 10
        )

    def test_out_of_range_and_null_weather_rejected(self):
        hourly = forecast()
        for timestamp in [hourly["time"][0] - 1, hourly["time"][-1] + 1]:
            with self.assertRaises(ProviderError):
                weather_at(hourly, datetime.fromtimestamp(timestamp, timezone.utc))
        hourly["rain"][0] = None
        with self.assertRaises(ProviderError):
            weather_at(hourly, datetime.fromtimestamp(hourly["time"][0], timezone.utc))

    def test_real_http_adapter_handles_timeout_and_invalid_json(self):
        for handler in [
            lambda request: httpx.Response(200, content=b"not-json"),
            lambda request: httpx.Response(429),
            lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("timeout")),
        ]:
            cache.clear()
            provider = Providers()
            provider.client.close()
            provider.client = httpx.Client(transport=httpx.MockTransport(handler))
            try:
                with self.assertRaises(ProviderError):
                    provider.get("https://weather.invalid", {})
            finally:
                provider.close()


class APITests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_validation_rejects_invalid_types_and_ranges(self):
        mutations = [
            {"load_lb": True},
            {"load_lb": -1},
            {"load_lb": math.nan},
            {"spacing_miles": 20},
            {"spacing_miles": 25.0},
            {"departure": "2026-10-12T12:00"},
            {"departure": "bad"},
            {"origin": {"name": "wrong", "coordinate": [0, 0]}},
            {"departure": (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()},
        ]
        for update in mutations:
            with self.subTest(update=update), self.assertRaises(ValueError):
                validate(trip() | update)

    def test_health_and_invalid_request(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.assertEqual(self.client.get("/api/plan").status_code, 405)
        self.assertEqual(
            self.client.post("/api/plan", data="{}", content_type="text/plain").status_code, 415
        )
        self.assertEqual(
            self.client.post("/api/plan", data="{", content_type="application/json").status_code,
            400,
        )
        response = self.client.post(
            "/api/plan", data=json.dumps(trip() | {"load_lb": -1}), content_type="application/json"
        )
        self.assertIn("80,000", response.json()["error"]["message"])

    def test_complete_plan_at_real_django_boundary(self):
        def forecasts(self, points):
            from .providers import location_key

            return {location_key(point): forecast() for point in points}

        with (
            patch.object(Providers, "routes", return_value=[road(), road(), road()]),
            patch.object(Providers, "forecasts", forecasts),
        ):
            response = self.client.post(
                "/api/plan", data=json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["routes"]), 3)
        self.assertEqual(data["recommended_id"], "route-1")
        self.assertEqual(len(data["forecast_hours"]), 49)
        self.assertTrue(0 < len(data["corridor"]) < 200)
        self.assertEqual(len(data["corridor"][0]["hours"]), 49)
        for route in data["routes"]:
            self.assertAlmostEqual(sum(route["summary"]["risk_miles"].values()), 100)
            self.assertEqual(route["checkpoints"][-1]["eta"], route["arrival"])
            self.assertEqual(
                route["segments"][-1]["coordinates"][-1], route["geometry"]["coordinates"][-1]
            )
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_no_travel_never_recommended(self):
        def forecasts(self, points):
            from .providers import location_key

            return {location_key(point): forecast(60) for point in points}

        with (
            patch.object(Providers, "routes", return_value=[road(), road(), road()]),
            patch.object(Providers, "forecasts", forecasts),
        ):
            response = self.client.post(
                "/api/plan", data=json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["recommended_id"])
        self.assertTrue(all(not r["summary"]["eligible"] for r in response.json()["routes"]))

    def test_provider_error_does_not_turn_into_safe_weather(self):
        with patch.object(Providers, "routes", side_effect=ProviderError("Forecast unavailable")):
            response = self.client.post(
                "/api/plan", data=json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("routes", response.json())

    def test_rate_limit(self):
        for _ in range(8):
            self.client.post("/api/plan", data="{}", content_type="application/json")
        self.assertEqual(
            self.client.post("/api/plan", data="{}", content_type="application/json").status_code,
            429,
        )

    def test_oversized_json_has_actionable_error(self):
        response = self.client.post(
            "/api/plan", data=json.dumps({"padding": "x" * 9000}), content_type="application/json"
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "request_too_large")
