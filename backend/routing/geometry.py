import bisect
import math

METERS_PER_MILE = 1609.344


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6_371_008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def checkpoints(route: dict, spacing: int) -> list[dict]:
    if any(not math.isfinite(route[k]) or route[k] <= 0 for k in ("distance", "duration")):
        raise ValueError("Routing service returned invalid trip totals.")
    coords = route["geometry"]["coordinates"]
    distances = [d for leg in route["legs"] for d in leg["annotation"]["distance"]]
    durations = [d for leg in route["legs"] for d in leg["annotation"]["duration"]]
    if len(coords) != len(distances) + 1 or len(durations) != len(distances):
        raise ValueError("Routing geometry and segment annotations do not align.")
    if not distances or sum(distances) <= 0 or sum(durations) <= 0:
        raise ValueError("Routing service returned an empty journey.")
    ds, ts = [0.0], [0.0]
    for d, t in zip(distances, durations):
        if not math.isfinite(d) or not math.isfinite(t) or d < 0 or t < 0:
            raise ValueError("Routing service returned invalid segment values.")
        ds.append(ds[-1] + d)
        ts.append(ts[-1] + t)
    # Preserve the provider's total distance and duration, including turn costs.
    distance_scale = route["distance"] / ds[-1]
    time_scale = route["duration"] / ts[-1]
    total = route["distance"] / METERS_PER_MILE
    targets = [i * spacing for i in range(math.ceil(total / spacing))] + [total]
    result = []
    for mile in targets:
        target = mile * METERS_PER_MILE / distance_scale
        i = min(len(coords) - 2, max(0, bisect.bisect_right(ds, target) - 1))
        f = (target - ds[i]) / distances[i] if distances[i] else 0
        f = max(0, min(1, f))
        point = [coords[i][j] + (coords[i + 1][j] - coords[i][j]) * f for j in (0, 1)]
        elapsed = (ts[i] + durations[i] * f) * time_scale
        # Duplicate nodes can carry nonzero turn costs. Keep endpoints exact.
        if mile == 0:
            point, elapsed, i = coords[0], 0.0, 0
        elif mile == total:
            point, elapsed, i = coords[-1], route["duration"], len(coords) - 2
        result.append(
            {
                "mile": mile,
                "coordinate": point,
                "geometry_index": i,
                "elapsed_s": elapsed,
            }
        )
    return result


def corridor(routes: list[dict]) -> list[dict]:
    """Bounded sampling grid within ~20 mi of the union of all routes."""
    anchors = []
    for route in routes:
        anchors.extend(p["coordinate"] for p in checkpoints(route, 10))
    lat0 = sum(p[1] for p in anchors) / len(anchors)
    xscale = 111_195 * math.cos(math.radians(lat0))
    yscale = 111_195
    projected = [(p[0] * xscale, p[1] * yscale) for p in anchors]
    pad = 32_000
    minx, maxx = min(x for x, _ in projected) - pad, max(x for x, _ in projected) + pad
    miny, maxy = min(y for _, y in projected) - pad, max(y for _, y in projected) + pad
    cell = max(24_000, math.sqrt((maxx - minx) * (maxy - miny) / 140))
    result = []
    for i in range(math.ceil((maxx - minx) / cell)):
        for j in range(math.ceil((maxy - miny) / cell)):
            x, y = minx + (i + 0.5) * cell, miny + (j + 0.5) * cell
            if min(math.hypot(x - a, y - b) for a, b in projected) <= pad + cell / 2:
                result.append(
                    {
                        "coordinate": [x / xscale, y / yscale],
                        "bounds": [
                            [(y - cell / 2) / yscale, (x - cell / 2) / xscale],
                            [(y + cell / 2) / yscale, (x + cell / 2) / xscale],
                        ],
                    }
                )
    return result
