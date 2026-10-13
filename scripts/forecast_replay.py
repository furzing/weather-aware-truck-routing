"""Record real provider replies once; replay without network access or current-date checks.

Replay detects regressions relative to the recording, not correctness of the initial answer.
Independent policy expectations are in routing/fixtures/scenarios.json.
"""

import argparse
import copy
import hashlib
import json
import os
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()
from django.core.cache import cache  # noqa: E402
from routing.providers import Providers  # noqa: E402
from routing.service import build_plan  # noqa: E402


def key(url, params):
    return json.dumps([url, params], sort_keys=True)


def digest(plan):
    stable = {k: v for k, v in plan.items() if k not in ("generated_at", "sources")}
    return hashlib.sha256(json.dumps(stable, sort_keys=True).encode()).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["record", "replay"])
    parser.add_argument("--file", type=Path, default=ROOT / "output/provider-recording.json")
    parser.add_argument(
        "--browser-check",
        type=Path,
        help="During replay, prepare an ignored browser script with captured plan data.",
    )
    args = parser.parse_args()
    if args.browser_check and args.mode != "replay":
        parser.error("--browser-check requires replay mode")
    if args.mode == "record":
        cache.clear()
        payload = {
            "origin": {"name": "Chicago, Illinois", "coordinate": [-87.6298, 41.8781]},
            "destination": {"name": "Detroit, Michigan", "coordinate": [-83.0458, 42.3314]},
            "departure": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "load_lb": 38000,
            "spacing_miles": 25,
        }
        replies, lock = {}, threading.Lock()
        original = Providers.get

        def get(self, url, params, ttl=600):
            response = original(self, url, params, ttl)
            with lock:
                replies[key(url, params)] = copy.deepcopy(response)
            return response

        data = dict(payload, departure=datetime.fromisoformat(payload["departure"]))
        with patch.object(Providers, "get", get):
            plan = build_plan(data)
        recording = {
            "format": 1,
            "retrieved_at": plan["sources"]["forecast_retrieved_at"],
            "payload": payload,
            "replies": replies,
            "decision_sha256": digest(plan),
        }
        args.file.parent.mkdir(parents=True, exist_ok=True)
        args.file.write_text(json.dumps(recording), encoding="utf-8")
        print(f"Recorded {len(replies)} actual provider replies to {args.file}")
    else:
        recording = json.loads(args.file.read_text(encoding="utf-8"))
        if recording.get("format") != 1:
            raise SystemExit("Unsupported recording format")
        data = dict(
            recording["payload"],
            departure=datetime.fromisoformat(recording["payload"]["departure"]),
        )

        def get(self, url, params, ttl=600):
            lookup = key(url, params)
            if lookup not in recording["replies"]:
                raise AssertionError(
                    "Recording does not contain this provider request; no live fallback."
                )
            return copy.deepcopy(recording["replies"][lookup])

        with (
            patch.object(Providers, "get", get),
            patch(
                "httpx.Client.get", side_effect=AssertionError("Network is disabled during replay")
            ),
        ):
            plan = build_plan(data)
        if digest(plan) != recording["decision_sha256"]:
            raise SystemExit(
                "Replay differs from the recorded plan. Investigate before updating the baseline."
            )
        if args.browser_check:
            source = args.browser_check.read_text(encoding="utf-8")
            marker = "const capturedPlan = null;"
            if source.count(marker) != 1:
                raise SystemExit("Browser check must contain exactly one captured-plan marker.")
            target = ROOT / "output/playwright" / f"{args.browser_check.stem}-replay.js"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(
                source.replace(marker, f"const capturedPlan = {json.dumps(plan)};"),
                encoding="utf-8",
            )
            print(f"Prepared captured-plan UI check: {target}")
        print(
            f"Offline replay matched: {len(plan['routes'])} routes; recommendation {plan['recommended_id']}"
        )
