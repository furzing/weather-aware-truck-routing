import json
import logging
import math
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from django.core.cache import cache
from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .geometry import distance
from .models import Trip
from .persistence import load_plan, save_plan
from .providers import ProviderError, Providers
from .schedule import PlanningLimitError
from .service import build_plan

logger = logging.getLogger(__name__)
slots = threading.BoundedSemaphore(3)


def error(message, code="invalid_request", status=400):
    return JsonResponse({"error": {"code": code, "message": message}}, status=status)


def validate(payload):
    if not isinstance(payload, dict):
        raise ValueError("Send a JSON object.")
    result = {}
    for field in ("origin", "destination"):
        point = payload.get(field)
        if (
            not isinstance(point, dict)
            or not isinstance(point.get("name"), str)
            or not 1 <= len(point["name"]) <= 180
        ):
            raise ValueError(f"Select an {field} from the city search results.")
        coord = point.get("coordinate")
        if (
            not isinstance(coord, list)
            or len(coord) != 2
            or any(type(v) not in (int, float) or not math.isfinite(v) for v in coord)
        ):
            raise ValueError(f"{field.title()} coordinates must be numeric longitude and latitude.")
        if not (-168 <= coord[0] <= -52 and 14 <= coord[1] <= 72):
            raise ValueError("Choose locations in North America (14–72°N, 168–52°W).")
        result[field] = {"name": point["name"], "coordinate": coord}
    if distance(result["origin"]["coordinate"], result["destination"]["coordinate"]) < 16_093.44:
        raise ValueError("Choose cities at least 10 miles apart.")
    weight = payload.get("load_lb")
    if type(weight) not in (int, float) or not math.isfinite(weight) or not 0 <= weight <= 80_000:
        raise ValueError("Enter a load weight from 0 to 80,000 lb.")
    spacing = payload.get("spacing_miles")
    if type(spacing) is not int or spacing not in (10, 25, 50):
        raise ValueError("Checkpoint spacing must be 10, 25, or 50 miles.")
    schedule_breaks = payload.get("schedule_breaks", True)
    if type(schedule_breaks) is not bool:
        raise ValueError("The break schedule option must be true or false.")
    try:
        departure = datetime.fromisoformat(payload["departure"].replace("Z", "+00:00"))
    except (KeyError, AttributeError, TypeError, ValueError) as exc:
        raise ValueError("Enter a departure date and time including its timezone.") from exc
    if departure.tzinfo is None or departure.utcoffset() is None:
        raise ValueError("Departure must include a timezone offset.")
    now = datetime.now(timezone.utc)
    if departure < now - timedelta(minutes=5) or departure > now + timedelta(days=3):
        raise ValueError("Choose a departure from now through the next 72 hours.")
    result.update(
        load_lb=weight,
        spacing_miles=spacing,
        departure=departure.astimezone(timezone.utc),
        schedule_breaks=schedule_breaks,
    )
    return result


def throttle(request, scope, limit):
    # Per-process guard for the assessment, not a distributed security boundary.
    key = f"rate:{scope}:{request.META.get('REMOTE_ADDR', 'unknown')}"
    cache.add(key, 0, 60)
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, 60)
        count = 1
    return count > limit


@require_GET
def index(request):
    response = render(request, "index.html")
    response["Cache-Control"] = "no-cache"
    return response


@require_GET
def health(request):
    try:
        Trip.objects.exists()
    except DatabaseError:
        return error("Trip storage is unavailable.", "storage_unavailable", 503)
    return JsonResponse({"status": "ok", "service": "weather-aware-truck-routing"})


@require_GET
def saved_plan(request, trip_id):
    if throttle(request, "saved_plan", 60):
        return error("Too many requests. Try again in a minute.", "rate_limited", 429)
    try:
        response = JsonResponse(load_plan(trip_id))
    except Trip.DoesNotExist:
        response = error(
            "Saved comparison not found or expired. Compare the trip again.", "not_found", 404
        )
    except DatabaseError:
        response = error("Trip storage is unavailable. Please retry.", "storage_unavailable", 503)
    response["Cache-Control"] = "private, no-store"
    response["Referrer-Policy"] = "no-referrer"
    return response


@require_GET
def places(request):
    if throttle(request, "places", 60):
        return error("Too many searches. Try again in a minute.", "rate_limited", 429)
    q = request.GET.get("q", "").strip()
    if not 2 <= len(q) <= 100:
        return error("Enter a city name between 2 and 100 characters.")
    provider = Providers()
    try:
        return JsonResponse({"places": provider.places(q)})
    except (ProviderError, KeyError, TypeError) as exc:
        logger.warning("Geocoding failed: %s", type(exc).__name__)
        return error(
            "City search is unavailable. Please retry shortly.", "provider_unavailable", 502
        )
    finally:
        provider.close()


@csrf_exempt  # Anonymous JSON API; no cookie authority. Cross-origin browser writes are rejected.
@require_POST
def plan(request):
    if request.content_type != "application/json":
        return error("Send the trip as application/json.", "unsupported_media_type", 415)
    origin = request.headers.get("Origin")
    if origin:
        try:
            parsed = urlsplit(origin)
        except ValueError:
            return error("Compare trips from this site's planner.", "origin_rejected", 403)
        if parsed.scheme not in ("http", "https") or parsed.netloc != request.get_host():
            return error("Compare trips from this site's planner.", "origin_rejected", 403)
    if throttle(request, "plan", 8):
        return error("Planning limit reached. Try again in a minute.", "rate_limited", 429)
    try:
        data = validate(json.loads(request.body))
    except RequestDataTooBig:
        return error("Trip data must be under 8 KiB.", "request_too_large", 413)
    except (ValueError, UnicodeDecodeError) as exc:
        return error(str(exc))
    if not slots.acquire(blocking=False):
        return error("The planner is busy. Please retry shortly.", "busy", 503)
    try:
        # Provider calls finish before entering the short storage transaction.
        response = JsonResponse(save_plan(build_plan(data)))
        response["Cache-Control"] = "private, no-store"
        return response
    except PlanningLimitError as exc:
        return error(str(exc), "unsupported_trip", 400)
    except ProviderError as exc:
        logger.warning("Planning failed: %s", exc)
        return error(str(exc), "provider_unavailable", 502)
    except DatabaseError as exc:
        logger.warning("Trip storage failed: %s", type(exc).__name__)
        return error("The comparison could not be saved. Please retry.", "storage_unavailable", 503)
    finally:
        slots.release()
