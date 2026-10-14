from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.test import SimpleTestCase

from .providers import Providers, location_key
from .schedule import PlanningLimitError, arrival_elapsed, planned_stops
from .service import build_plan
from .tests import forecast, road, trip
from .views import validate


class ScheduleTests(SimpleTestCase):
    def route(self, hours):
        raw = road()
        raw["duration"] = hours * 3600
        raw["legs"][0]["annotation"]["duration"] = [hours * 1800] * 2
        return raw

    def test_exact_destination_limits_and_multiple_shifts(self):
        cases = [
            (8, []),
            (8.001, ["break"]),
            (11, ["break"]),
            (11.001, ["break", "rest"]),
            (19, ["break", "rest"]),
            (22, ["break", "rest", "break"]),
            (22.001, ["break", "rest", "break", "rest"]),
        ]
        for hours, kinds in cases:
            with self.subTest(hours=hours):
                stops = planned_stops(self.route(hours))
                self.assertEqual([s["kind"] for s in stops], kinds)
                self.assertTrue(all(s["driving_elapsed_s"] < hours * 3600 for s in stops))
        stops = planned_stops(self.route(12))
        self.assertEqual(
            [(s["start_elapsed_s"], s["end_elapsed_s"]) for s in stops],
            [(28800, 30600), (41400, 77400)],
        )
        self.assertAlmostEqual(stops[0]["mile"], 100 * 8 / 12)
        self.assertEqual(arrival_elapsed(28800, stops), 28800)
        self.assertEqual(arrival_elapsed(28801, stops), 30601)
        self.assertEqual(arrival_elapsed(43200, stops), 81000)

    def test_each_shift_respects_driving_break_and_elapsed_windows(self):
        for duration in range(1, 271):
            raw = self.route(duration / 10)
            stops = planned_stops(raw)
            shift_driving = shift_start = last_interruption = 0
            for stop in stops:
                self.assertLessEqual(stop["driving_elapsed_s"] - shift_driving, 11 * 3600)
                self.assertLessEqual(stop["driving_elapsed_s"] - last_interruption, 8 * 3600)
                self.assertLessEqual(stop["start_elapsed_s"] - shift_start, 14 * 3600)
                last_interruption = stop["driving_elapsed_s"]
                if stop["kind"] == "rest":
                    self.assertEqual(stop["duration_s"], 10 * 3600)
                    shift_driving = stop["driving_elapsed_s"]
                    shift_start = stop["end_elapsed_s"]
            total = arrival_elapsed(raw["duration"], stops)
            self.assertLessEqual(raw["duration"] - shift_driving, 11 * 3600)
            self.assertLessEqual(raw["duration"] - last_interruption, 8 * 3600)
            self.assertLessEqual(total - shift_start, 14 * 3600)

    def test_forecast_horizon_includes_stops_and_opt_out_is_explicit(self):
        self.assertEqual(arrival_elapsed(27 * 3600, planned_stops(self.route(27))), 48 * 3600)
        with self.assertRaises(PlanningLimitError):
            planned_stops(self.route(27.001))
        self.assertEqual(planned_stops(self.route(12), False), [])
        self.assertTrue(validate(trip())["schedule_breaks"])
        for value in ["true", 1, None]:
            with self.assertRaises(ValueError):
                validate(trip() | {"schedule_breaks": value})

    def test_stopped_weather_can_exclude_clear_driving_checkpoints(self):
        hourly = forecast()
        start = datetime.fromtimestamp(hourly["time"][0], timezone.utc)
        hourly["wind_speed_10m"][15] = 55

        def forecasts(provider, points):
            return {location_key(p): hourly for p in points}

        data = validate(trip()) | {"departure": start}
        with (
            patch.object(Providers, "routes", return_value=[self.route(12)] * 3),
            patch.object(Providers, "forecasts", forecasts),
        ):
            plan = build_plan(data)
            route = plan["routes"][0]
            self.assertEqual(route["duration_s"], 43200)
            self.assertEqual(route["total_duration_s"], 81000)
            self.assertEqual(route["arrival"], (start + timedelta(hours=22.5)).isoformat())
            self.assertEqual(route["checkpoints"][3]["elapsed_s"], 9.5 * 3600)
            self.assertTrue(all(p["risk"]["level"] == 0 for p in route["checkpoints"]))
            self.assertEqual(route["stops"][1]["risk"]["level"], 4)
            self.assertEqual(route["summary"]["risk_miles"]["No Travel"], 0)
            self.assertFalse(route["summary"]["eligible"])
            self.assertIsNone(plan["recommended_id"])
            continuous = build_plan(data | {"schedule_breaks": False})
            self.assertEqual(continuous["routes"][0]["total_duration_s"], 43200)
            self.assertIsNotNone(continuous["recommended_id"])

    def test_horizon_failure_is_a_request_error_not_provider_outage(self):
        with patch.object(Providers, "routes", return_value=[self.route(28)] * 3):
            response = self.client.post("/api/plan", data=trip(), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "unsupported_trip")
