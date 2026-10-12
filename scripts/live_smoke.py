"""One live, bounded local smoke check. No load testing of public providers."""

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
with httpx.Client(base_url=base, timeout=95) as client:
    for query in ("Chicago", "Detroit"):
        response = client.get("/api/places", params={"q": query})
        response.raise_for_status()
        assert response.json()["places"], f"No geocoding result for {query}"
    payload = {
        "origin": {"name": "Chicago, Illinois", "coordinate": [-87.6298, 41.8781]},
        "destination": {"name": "Detroit, Michigan", "coordinate": [-83.0458, 42.3314]},
        "departure": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "load_lb": 38_000,
        "spacing_miles": 25,
    }
    started = time.perf_counter()
    response = client.post("/api/plan", json=payload)
    if response.status_code != 200:
        raise SystemExit(f"Live plan failed ({response.status_code}): {response.text}")
    data = response.json()
    assert len(data["routes"]) == 3
    assert len(data["forecast_hours"]) == 49
    for route in data["routes"]:
        assert abs(sum(route["summary"]["risk_miles"].values()) - route["distance_miles"]) < 1e-6
        assert route["checkpoints"][-1]["eta"] == route["arrival"]
    target = Path(__file__).resolve().parents[1] / "output" / "live-plan.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(data), encoding="utf-8")
    print(
        json.dumps(
            {
                "elapsed_seconds": round(time.perf_counter() - started, 2),
                "routes": [
                    {
                        "id": r["id"],
                        "miles": round(r["distance_miles"], 1),
                        "checkpoints": len(r["checkpoints"]),
                        "max_risk": r["summary"]["max_risk"],
                        "via_note": r["via_note"],
                    }
                    for r in data["routes"]
                ],
                "corridor_cells": len(data["corridor"]),
                "forecast_locations": data["sources"]["forecast_locations"],
                "recommended_id": data["recommended_id"],
            },
            indent=2,
        )
    )
