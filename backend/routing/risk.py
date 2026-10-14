"""Assessment policy. Risk values are ordinal, not accident probabilities."""

import math
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


LABELS = ("Low", "Moderate", "High", "Severe", "No Travel")


def classify(wind_mph: float, rain_in: float, snow_in: float, load_lb: float) -> dict:
    if any(not math.isfinite(v) or v < 0 for v in (wind_mph, rain_in, snow_in, load_lb)):
        raise ValueError("Weather and load values must be finite and nonnegative.")
    wind = sum(wind_mph >= x for x in (25, 35, 45, 55))
    # At shared bounds, use the higher risk; No Travel remains strictly > 1 / > 3.
    rain = Risk.NO_TRAVEL if rain_in > 1 else sum(rain_in >= x for x in (0.1, 0.25, 0.5))
    snow = Risk.NO_TRAVEL if snow_in > 3 else sum(snow_in >= x for x in (0.5, 1, 2))
    reasons = []
    if wind_mph >= 55:
        reasons.append("Wind at or above 55 mph: no travel for any load.")
    elif wind_mph >= 45 and load_lb > 30_000:
        wind = Risk.NO_TRAVEL
        reasons.append("Wind at or above 45 mph with a load over 30,000 lb.")
    elif wind_mph >= 35 and load_lb > 40_000:
        wind = max(wind, Risk.SEVERE)
        reasons.append("Wind at or above 35 mph with a load over 40,000 lb.")
    level = max(wind, rain, snow)
    for name, value in (("Wind", wind), ("Rain", rain), ("Snow", snow)):
        if value == level and level > 0:
            reasons.append(f"{name}: {LABELS[level]}.")
    return {"level": level, "label": LABELS[level], "reasons": reasons}


def summarize(checkpoints: list[dict], duration_s: float) -> dict:
    miles = [0.0] * 5
    # Conservatively assign each interval the worse of its bounding checkpoints.
    for a, b in zip(checkpoints, checkpoints[1:]):
        miles[max(a["risk"]["level"], b["risk"]["level"])] += b["mile"] - a["mile"]
    total = sum(miles)
    return {
        "risk_miles": dict(zip(LABELS, miles)),
        "average_risk": sum(i * m for i, m in enumerate(miles)) / total if total else 0,
        "max_risk": max(p["risk"]["level"] for p in checkpoints),
        "eligible": all(p["risk"]["level"] < Risk.NO_TRAVEL for p in checkpoints),
        "duration_s": duration_s,
    }


def priority(route):
    s = route["summary"]
    return (
        s["risk_miles"]["Severe"],
        s["risk_miles"]["High"],
        s["average_risk"],
        s["duration_s"],
        route["id"],
    )


def recommendation(routes: list[dict]) -> str | None:
    eligible = [r for r in routes if r["summary"]["eligible"]]
    if not eligible:
        return None

    return min(eligible, key=priority)["id"]


def explain_recommendation(routes):
    eligible = sorted((r for r in routes if r["summary"]["eligible"]), key=priority)
    if not eligible:
        return "Every route includes No Travel conditions. Delay departure and check again."
    winner = eligible[0]
    prefix = f"{winner['name']} is recommended. "
    if len(eligible) == 1:
        return prefix + "It is the only route without No Travel checkpoints or planned stops."
    runner_up = eligible[1]
    names = ("Severe exposure", "High exposure", "average risk", "driving time")
    for i, name in enumerate(names):
        a, b = priority(winner)[i], priority(runner_up)[i]
        if a != b:
            if i < 2:
                detail = f"{a:.1f} vs {b:.1f} miles"
            elif i == 2:
                detail = f"{a:.3f} vs {b:.3f} on the ordinal 0–4 scale"
            else:
                detail = f"{a / 60:.1f} vs {b / 60:.1f} minutes"
            return (
                prefix
                + f"Lower {name} than {runner_up['name']}: {detail}. Earlier ranking criteria are tied."
            )
    return prefix + "Eligible routes tie on all four criteria; route ID resolves the tie."
