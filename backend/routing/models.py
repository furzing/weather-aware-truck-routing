import uuid

from django.db import models
from django.db.models import Q


class Trip(models.Model):
    # An unlisted capability link, not a sequential public trip directory.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    departure = models.DateTimeField()
    origin = models.JSONField()
    destination = models.JSONField()
    load_lb = models.FloatField()
    spacing_miles = models.PositiveSmallIntegerField()
    schedule_breaks = models.BooleanField()
    recommended_route_key = models.CharField(max_length=32, null=True)
    recommendation_reason = models.TextField()
    generated_at = models.DateTimeField()
    corridor = models.JSONField()
    forecast_hours = models.JSONField()
    sources = models.JSONField()
    warnings = models.JSONField()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(load_lb__gte=0, load_lb__lte=80000), name="trip_load_range"
            ),
            models.CheckConstraint(
                condition=Q(spacing_miles__in=[10, 25, 50]), name="trip_spacing"
            ),
        ]


class Route(models.Model):
    trip = models.ForeignKey(Trip, related_name="routes", on_delete=models.CASCADE)
    key = models.CharField(max_length=32)
    position = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=80)
    via_note = models.TextField()
    geometry = models.JSONField()
    geometry_elapsed_s = models.JSONField()
    segments = models.JSONField()
    distance_miles = models.FloatField()
    driving_duration_s = models.FloatField()
    stop_duration_s = models.FloatField()
    total_duration_s = models.FloatField()
    arrival = models.DateTimeField()
    stops = models.JSONField()
    summary = models.JSONField()

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(fields=["trip", "key"], name="route_key_per_trip"),
            models.UniqueConstraint(fields=["trip", "position"], name="route_order_per_trip"),
            models.CheckConstraint(
                condition=Q(
                    distance_miles__gt=0, driving_duration_s__gte=0, stop_duration_s__gte=0
                ),
                name="route_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(
                    total_duration_s=models.F("driving_duration_s") + models.F("stop_duration_s")
                ),
                name="route_total_duration",
            ),
        ]


class Checkpoint(models.Model):
    route = models.ForeignKey(Route, related_name="checkpoints", on_delete=models.CASCADE)
    position = models.PositiveIntegerField()
    mile = models.FloatField()
    coordinate = models.JSONField()
    elapsed_s = models.FloatField()
    driving_elapsed_s = models.FloatField()
    eta = models.DateTimeField()
    weather = models.JSONField()
    risk = models.JSONField()

    class Meta:
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["route", "position"], name="checkpoint_order_per_route"
            ),
            models.CheckConstraint(
                condition=Q(mile__gte=0, elapsed_s__gte=0, driving_elapsed_s__gte=0),
                name="checkpoint_nonnegative",
            ),
        ]
