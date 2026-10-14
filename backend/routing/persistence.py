from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Checkpoint, Route, Trip


def save_plan(plan):
    """Commit a completed comparison atomically, after all provider work finishes."""
    with transaction.atomic():
        trip = Trip.objects.create(
            expires_at=timezone.now() + timedelta(days=7),
            departure=plan["departure"],
            origin=plan["origin"],
            destination=plan["destination"],
            load_lb=plan["load_lb"],
            spacing_miles=plan["spacing_miles"],
            schedule_breaks=plan["schedule_breaks"],
            recommended_route_key=plan["recommended_id"],
            recommendation_reason=plan["recommendation_reason"],
            generated_at=plan["generated_at"],
            corridor=plan["corridor"],
            forecast_hours=plan["forecast_hours"],
            sources=plan["sources"],
            warnings=plan["warnings"],
        )
        for i, value in enumerate(plan["routes"]):
            route = Route.objects.create(
                trip=trip,
                key=value["id"],
                position=i,
                name=value["name"],
                via_note=value["via_note"],
                geometry=value["geometry"],
                geometry_elapsed_s=value["geometry_elapsed_s"],
                segments=value["segments"],
                distance_miles=value["distance_miles"],
                driving_duration_s=value["duration_s"],
                stop_duration_s=value["stop_duration_s"],
                total_duration_s=value["total_duration_s"],
                arrival=value["arrival"],
                stops=value["stops"],
                summary=value["summary"],
            )
            Checkpoint.objects.bulk_create(
                [
                    Checkpoint(route=route, position=j, **point)
                    for j, point in enumerate(value["checkpoints"])
                ]
            )
    # Return through the same ORM read path used when reopening the link.
    return load_plan(trip.id)


def load_plan(trip_id):
    # Three bounded SELECTs: trip, routes, and all checkpoints. No per-point reads.
    trip = (
        Trip.objects.filter(id=trip_id, expires_at__gt=timezone.now())
        .prefetch_related("routes__checkpoints")
        .get()
    )
    routes = []
    for route in trip.routes.all():
        routes.append(
            {
                "id": route.key,
                "name": route.name,
                "via_note": route.via_note,
                "geometry": route.geometry,
                "geometry_elapsed_s": route.geometry_elapsed_s,
                "segments": route.segments,
                "distance_miles": route.distance_miles,
                "duration_s": route.driving_duration_s,
                "stop_duration_s": route.stop_duration_s,
                "total_duration_s": route.total_duration_s,
                "arrival": route.arrival.isoformat(),
                "stops": route.stops,
                "summary": route.summary,
                "checkpoints": [
                    {
                        "mile": p.mile,
                        "coordinate": p.coordinate,
                        "elapsed_s": p.elapsed_s,
                        "driving_elapsed_s": p.driving_elapsed_s,
                        "eta": p.eta.isoformat(),
                        "weather": p.weather,
                        "risk": p.risk,
                    }
                    for p in route.checkpoints.all()
                ],
            }
        )
    return {
        "trip_id": str(trip.id),
        "expires_at": trip.expires_at.isoformat(),
        "routes": routes,
        "recommended_id": trip.recommended_route_key,
        "recommendation_reason": trip.recommendation_reason,
        "generated_at": trip.generated_at.isoformat(),
        "corridor": trip.corridor,
        "forecast_hours": trip.forecast_hours,
        "departure": trip.departure.isoformat(),
        "origin": trip.origin,
        "destination": trip.destination,
        "load_lb": trip.load_lb,
        "spacing_miles": trip.spacing_miles,
        "schedule_breaks": trip.schedule_breaks,
        "sources": trip.sources,
        "warnings": trip.warnings,
    }
