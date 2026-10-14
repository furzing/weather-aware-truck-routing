"""Independent policy examples and explicitly synthetic stress cases; no fleet claims."""

import copy
import itertools
import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import httpx
from django.conf import settings
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase

from .geometry import checkpoints, road_overlap
from .providers import ProviderError, Providers, location_key, weather_at
from .risk import LABELS, classify, explain_recommendation, recommendation, summarize
from .tests import forecast, road, trip


class ScenarioTests(TestCase):
    def test_golden_route_decisions(self):
        cases = json.loads((Path(__file__).parent / "fixtures/scenarios.json").read_text())
        for case in cases:
            with self.subTest(case=case["name"]):
                routes = []
                for i, (miles, seconds, wind, rain, snow) in enumerate(case["routes"]):
                    risk = classify(wind, rain, snow, case["load"])
                    self.assertEqual(risk["level"], case["levels"][i])
                    summary = summarize(
                        [{"mile": 0, "risk": risk}, {"mile": miles, "risk": risk}], seconds
                    )
                    self.assertEqual(summary["risk_miles"][LABELS[case["levels"][i]]], miles)
                    self.assertEqual(summary["average_risk"], case["levels"][i])
                    routes.append(
                        {"id": f"route-{i + 1}", "name": f"Route {i + 1}", "summary": summary}
                    )
                for order in itertools.permutations(routes):
                    self.assertEqual(recommendation(order), case["recommended"])
                self.assertIn(case["reason"], explain_recommendation(routes))

    def test_500_combined_weather_load_cases(self):
        # Expected wind levels are a manually specified policy table, not production logic.
        wind_expected = {
            0: [0, 1, 2, 3, 4],
            30000: [0, 1, 2, 3, 4],
            30001: [0, 1, 2, 4, 4],
            40001: [0, 1, 3, 4, 4],
        }
        for load, wi, ri, si in itertools.product(wind_expected, range(5), range(5), range(5)):
            with self.subTest(load=load, wind_index=wi, rain_index=ri, snow_index=si):
                actual = classify(
                    [10, 30, 40, 50, 60][wi],
                    [0, 0.2, 0.3, 0.8, 1.1][ri],
                    [0, 0.8, 1.5, 2.5, 3.1][si],
                    load,
                )
                self.assertEqual(actual["level"], max(wind_expected[load][wi], ri, si))

    def test_narrow_hazard_exposes_sampling_limit(self):
        result = {}
        for spacing in (10, 25, 50):
            points = checkpoints(road(), spacing)
            for point in points:
                point["risk"] = classify(60 if 9 <= point["mile"] <= 11 else 10, 0, 0, 0)
            result[spacing] = summarize(points, 7200)["risk_miles"]["No Travel"]
        self.assertEqual(result, {10: 20, 25: 0, 50: 0})
        # This intentionally demonstrates a missed hazard, not improved accuracy from smoothing.

    def test_departure_sensitivity_changes_exposure(self):
        hourly = forecast()
        hourly["wind_speed_10m"][2] = 60
        start = datetime.fromtimestamp(hourly["time"][0], timezone.utc)
        levels = [
            classify(
                **{
                    k: v
                    for k, v in weather_at(hourly, start.replace(hour=h)).items()
                    if k != "forecast_time"
                },
                load_lb=0,
            )["level"]
            for h in (1, 2, 3)
        ]
        self.assertEqual(levels, [0, 4, 0])

    def test_dst_fall_back_and_spring_forward_use_elapsed_utc(self):
        zone = ZoneInfo("America/New_York")
        fall = [
            datetime(2026, 11, 1, 1, 30, tzinfo=zone, fold=fold).astimezone(timezone.utc)
            for fold in (0, 1)
        ]
        self.assertEqual((fall[1] - fall[0]).total_seconds(), 3600)
        spring = [
            datetime(2026, 3, 8, hour, 30, tzinfo=zone).astimezone(timezone.utc) for hour in (1, 3)
        ]
        self.assertEqual((spring[1] - spring[0]).total_seconds(), 3600)
        hourly = {
            "time": [int(fall[0].timestamp()), int(fall[1].timestamp())],
            "wind_speed_10m": [10, 60],
            "rain": [0, 0],
            "showers": [0, 0],
            "snowfall": [0, 0],
        }
        self.assertEqual(weather_at(hourly, fall[0])["wind_mph"], 10)
        self.assertEqual(weather_at(hourly, fall[1])["wind_mph"], 60)

    def test_mixed_risk_routes_at_real_api_boundary(self):
        roads = []
        for lat in (42, 43, 44):
            item = road()
            item["geometry"]["coordinates"] = [[-88, lat], [-87, lat], [-86, lat]]
            roads.append(item)

        def forecasts(self, points):
            return {
                location_key(p): forecast({42: 45, 43: 35, 44: 10}.get(round(p[1]), 10))
                for p in points
            }

        with (
            patch.object(Providers, "routes", return_value=roads),
            patch.object(Providers, "forecasts", forecasts),
        ):
            response = self.client.post(
                "/api/plan", json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["recommended_id"], "route-3")
        self.assertEqual([r["summary"]["max_risk"] for r in data["routes"]], [4, 2, 0])
        self.assertIn("High exposure", data["recommendation_reason"])


class ProviderScenarioTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_one_retry_for_transient_failures_but_not_quotas_or_malformed_json(self):
        for first, expected_calls, succeeds in [
            (httpx.ConnectError("temporary connection failure"), 2, True),
            (httpx.Response(503), 2, True),
            (httpx.Response(429), 1, False),
            (httpx.Response(200, content=b"not-json"), 1, False),
        ]:
            cache.clear()
            calls = []

            def handler(request):
                calls.append(request)
                if len(calls) == 1:
                    if isinstance(first, Exception):
                        raise first
                    return first
                return httpx.Response(200, json={"valid": True})

            provider = Providers()
            provider.client.close()
            provider.client = httpx.Client(transport=httpx.MockTransport(handler))
            try:
                with self.subTest(first=type(first).__name__):
                    if succeeds:
                        self.assertEqual(provider.get(settings.WEATHER_URL, {}), {"valid": True})
                        self.assertEqual(len(provider.forecast_fetch_times), 1)
                    else:
                        with self.assertRaises(ProviderError):
                            provider.get(settings.WEATHER_URL, {})
                    self.assertEqual(len(calls), expected_calls)
            finally:
                provider.close()

    def test_cache_preserves_original_retrieval_and_expiry_refetches(self):
        provider = Providers()
        provider.client.close()
        calls = []
        provider.client = httpx.Client(
            transport=httpx.MockTransport(
                lambda request: calls.append(request) or httpx.Response(200, json={"hourly": {}})
            )
        )
        try:
            first = datetime(2026, 1, 1, tzinfo=timezone.utc)
            later = datetime(2026, 1, 1, 0, 11, tzinfo=timezone.utc)
            with patch("routing.providers.datetime") as clock:
                clock.now.return_value = first
                provider.get(settings.WEATHER_URL, {})
                clock.now.return_value = later
                provider.get(settings.WEATHER_URL, {})
                self.assertEqual(provider.forecast_fetch_times, [first.isoformat()] * 2)
                self.assertEqual(provider.forecast_cache_hits, 1)
                # Eviction exercises the same miss path as TTL expiry without a blocking sleep.
                cache.clear()
                provider.get(settings.WEATHER_URL, {})
                self.assertEqual(provider.forecast_fetch_times[-1], later.isoformat())
                # A negative TTL expires immediately: both requests must reach the transport.
                provider.get(settings.WEATHER_URL, {"expiry_case": True}, ttl=-1)
                provider.get(settings.WEATHER_URL, {"expiry_case": True}, ttl=-1)
            self.assertEqual(len(calls), 4)
        finally:
            provider.close()

    def test_equal_metrics_different_roads_are_not_duplicates(self):
        routes = [road() for _ in range(3)]
        for index, route in enumerate(routes):
            route["geometry"]["coordinates"][1][1] += index * 0.1
        self.assertEqual(road_overlap(routes[0], routes[0]), 1)
        self.assertLess(road_overlap(routes[0], routes[1]), 0.98)
        provider = Providers()
        try:
            with patch.object(provider, "get", return_value={"code": "Ok", "routes": routes}):
                self.assertEqual(len(provider.routes([-88, 42], [-86, 42])), 3)
        finally:
            provider.close()

    def test_malformed_provider_route_is_an_explicit_api_failure(self):
        broken = road()
        broken["geometry"]["coordinates"] = []
        with patch.object(Providers, "routes", return_value=[broken] * 3):
            response = self.client.post(
                "/api/plan", json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("routes", response.json())

    def test_invalid_geometry_never_becomes_a_plausible_checkpoint(self):
        for point in ([float("nan"), 42], [-88, float("inf")], [0, 91], [181, 0], [True, 42], [42]):
            broken = road()
            broken["geometry"]["coordinates"][1] = point
            with self.subTest(point=point), self.assertRaises(ValueError):
                checkpoints(broken, 25)
        for field in ("distance", "duration"):
            broken = road()
            broken[field] = True
            with self.subTest(field=field), self.assertRaises(ValueError):
                checkpoints(broken, 25)

    def test_missing_forecast_location_and_invalid_values_fail(self):
        row = {
            "hourly_units": {
                "time": "unixtime",
                "wind_speed_10m": "mp/h",
                "rain": "mm",
                "showers": "mm",
                "snowfall": "cm",
            },
            "hourly": forecast(),
        }
        provider = Providers()
        try:
            with patch.object(provider, "get", return_value=[row]):
                with self.assertRaises(ProviderError):
                    provider.forecasts([[-88, 42], [-87, 42]])
            for value in (None, float("nan"), float("inf"), -1, True):
                hourly = copy.deepcopy(row["hourly"])
                hourly["snowfall"][0] = value
                with self.subTest(value=value), self.assertRaises(ProviderError):
                    weather_at(hourly, datetime.fromtimestamp(hourly["time"][0], timezone.utc))
        finally:
            provider.close()
