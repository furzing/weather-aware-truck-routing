import json
import uuid
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from .models import Checkpoint, Route, Trip
from .persistence import load_plan, save_plan
from .providers import ProviderError, Providers, location_key
from .risk import explain_recommendation, recommendation, summarize
from .service import build_plan
from .tests import forecast, road, trip
from .views import validate


def forecasts(provider, points):
    return {location_key(point): forecast() for point in points}


class PersistenceTests(TestCase):
    def setUp(self):
        cache.clear()

    def make_plan(self):
        with (
            patch.object(Providers, "routes", return_value=[road(), road(), road()]),
            patch.object(Providers, "forecasts", forecasts),
        ):
            return build_plan(validate(trip()))

    def test_post_persists_and_get_reconstructs_without_provider_calls(self):
        with (
            patch.object(Providers, "routes", return_value=[road(), road(), road()]),
            patch.object(Providers, "forecasts", forecasts),
        ):
            response = self.client.post(
                "/api/plan", json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(Trip.objects.count(), 1)
        self.assertEqual(Route.objects.count(), 3)
        self.assertEqual(
            Checkpoint.objects.count(), sum(len(r["checkpoints"]) for r in data["routes"])
        )
        with patch.object(Providers, "routes", side_effect=AssertionError("No refetch")):
            restored = self.client.get(f"/api/plans/{data['trip_id']}")
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json(), data)
        self.assertEqual(restored.headers["Cache-Control"], "private, no-store")
        self.assertEqual(restored.headers["Referrer-Policy"], "no-referrer")
        with self.assertNumQueries(3):
            self.assertEqual(load_plan(data["trip_id"]), data)

    def test_atomic_rollback_leaves_no_partial_comparison(self):
        plan = self.make_plan()
        with patch.object(
            Checkpoint.objects, "bulk_create", side_effect=IntegrityError("write failed")
        ):
            with self.assertRaises(IntegrityError):
                save_plan(plan)
        self.assertEqual(Trip.objects.count(), 0)
        self.assertEqual(Route.objects.count(), 0)
        self.assertEqual(Checkpoint.objects.count(), 0)

    def test_expired_and_unknown_links_return_same_error_and_cleanup_cascades(self):
        data = save_plan(self.make_plan())
        Trip.objects.filter(id=data["trip_id"]).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        expired = self.client.get(f"/api/plans/{data['trip_id']}")
        unknown = self.client.get(f"/api/plans/{uuid.uuid4()}")
        self.assertEqual(expired.status_code, 404)
        self.assertEqual(expired.json(), unknown.json())
        call_command("purge_expired_trips", verbosity=0)
        self.assertEqual(Trip.objects.count(), 0)
        self.assertEqual(Route.objects.count(), 0)
        self.assertEqual(Checkpoint.objects.count(), 0)

    def test_duration_and_order_constraints_are_enforced_by_database(self):
        data = save_plan(self.make_plan())
        route = Route.objects.first()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Route.objects.filter(pk=route.pk).update(total_duration_s=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Checkpoint.objects.filter(route=route, position=1).update(position=0)
        self.assertEqual(load_plan(data["trip_id"]), data)

    def test_provider_failure_writes_nothing_and_storage_failure_is_explicit(self):
        with patch.object(Providers, "routes", side_effect=ProviderError("Unavailable")):
            response = self.client.post(
                "/api/plan", json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(Trip.objects.count(), 0)
        with (
            patch("routing.views.build_plan", return_value=self.make_plan()),
            patch("routing.views.save_plan", side_effect=DatabaseError("disk unavailable")),
        ):
            response = self.client.post(
                "/api/plan", json.dumps(trip()), content_type="application/json"
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "storage_unavailable")
        self.assertNotIn("routes", response.json())

    def test_cross_origin_write_rejected_before_provider_work(self):
        for origin in ("https://other.example", "http://["):
            with self.subTest(origin=origin), patch("routing.views.build_plan") as build:
                response = self.client.post(
                    "/api/plan",
                    json.dumps(trip()),
                    content_type="application/json",
                    HTTP_ORIGIN=origin,
                )
            self.assertEqual(response.status_code, 403)
            build.assert_not_called()

    def test_service_summary_uses_elapsed_journey_and_explanation_names_it(self):
        routes = [road(), road(), road()]
        for route, hours in zip(routes, [12, 10, 8]):
            route["duration"] = hours * 3600
        with (
            patch.object(Providers, "routes", return_value=routes),
            patch.object(Providers, "forecasts", forecasts),
        ):
            data = build_plan(validate(trip()))
        self.assertEqual(
            [r["summary"]["duration_s"] / 3600 for r in data["routes"]], [22.5, 10.5, 8]
        )
        self.assertTrue(
            all(r["summary"]["duration_s"] == r["total_duration_s"] for r in data["routes"])
        )
        self.assertIn("scheduled travel time", data["recommendation_reason"])

    def test_risk_ties_use_total_time_even_when_driving_order_differs(self):
        # Independently scheduled alternatives: the longer drive has the shorter trip.
        points = [{"mile": 0, "risk": {"level": 0}}, {"mile": 100, "risk": {"level": 0}}]
        routes = [
            {
                "id": "short-drive",
                "name": "Short drive",
                "duration_s": 7 * 3600,
                "summary": summarize(points, 17 * 3600),
            },
            {
                "id": "short-trip",
                "name": "Short trip",
                "duration_s": 8 * 3600,
                "summary": summarize(points, 8 * 3600),
            },
        ]
        self.assertEqual(recommendation(routes), "short-trip")
        self.assertIn("scheduled travel time", explain_recommendation(routes))
