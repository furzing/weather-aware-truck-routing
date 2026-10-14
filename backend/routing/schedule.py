"""Standard U.S. property-carrying baseline, assuming fresh shift/cycle availability.

No prior duty, loading, exceptions, split sleeper, parking, or traffic is inferred.
"""

from bisect import bisect_right

from .geometry import geometry_elapsed


class PlanningLimitError(ValueError):
    pass


def planned_stops(route, enabled=True):
    stops, driven, stopped, shift = [], 0.0, 0.0, 0.0
    times = geometry_elapsed(route)
    coords = route["geometry"]["coordinates"]
    distances = [d for leg in route["legs"] for d in leg["annotation"]["distance"]]
    cumulative = [0.0]
    for value in distances:
        cumulative.append(cumulative[-1] + value)
    while enabled:
        # No stop is needed after reaching the destination exactly at a limit.
        next_driving = driven + (8 if shift == 0 else 3) * 3600
        if next_driving >= route["duration"]:
            break
        driven = next_driving
        rest = shift != 0
        seconds = (10 * 3600) if rest else 30 * 60
        i = min(len(times) - 2, bisect_right(times, driven) - 1)
        fraction = (driven - times[i]) / (times[i + 1] - times[i])
        stops.append(
            {
                "kind": "rest" if rest else "break",
                "driving_elapsed_s": driven,
                "start_elapsed_s": driven + stopped,
                "end_elapsed_s": driven + stopped + seconds,
                "duration_s": seconds,
                "coordinate": [
                    coords[i][j] + (coords[i + 1][j] - coords[i][j]) * fraction for j in (0, 1)
                ],
                "mile": (cumulative[i] + distances[i] * fraction)
                * route["distance"]
                / cumulative[-1]
                / 1609.344,
            }
        )
        stopped += seconds
        shift = 0 if rest else 8
    if route["duration"] + stopped > 48 * 3600:
        raise PlanningLimitError(
            "This trip exceeds the 48-hour forecast preview after planned breaks and rest. "
            "Choose a shorter leg; do not remove required rest to fit the forecast."
        )
    return stops


def arrival_elapsed(driving_seconds, stops):
    # At a stop location, the checkpoint denotes arrival, before its interruption.
    return driving_seconds + sum(
        stop["duration_s"] for stop in stops if stop["driving_elapsed_s"] < driving_seconds
    )
