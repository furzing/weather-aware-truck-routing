"""Offline scenario checks and three deliberate policy mutations. No source edits."""

import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django  # noqa: E402

django.setup()
from routing.risk import classify  # noqa: E402


class EvaluationResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.scenarios = []

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if "case" in subtest.params:
            self.scenarios.append({"name": subtest.params["case"], "passed": err is None})


def run(names):
    suite = unittest.defaultTestLoader.loadTestsFromNames(names)
    return unittest.TextTestRunner(stream=io.StringIO(), resultclass=EvaluationResult).run(suite)


def low_wind_limit(wind, rain, snow, load):
    result = classify(wind, rain, snow, load)
    if wind >= 55 and rain <= 1 and snow <= 3:
        result = {"level": 3, "label": "Severe", "reasons": ["Deliberate test mutation"]}
    return result


def nonstrict_load(wind, rain, snow, load):
    result = classify(wind, rain, snow, load)
    if wind >= 45 and load == 30000:
        result = {"level": 4, "label": "No Travel", "reasons": ["Deliberate test mutation"]}
    return result


def fastest(routes):
    eligible = [r for r in routes if r["summary"]["eligible"]]
    return min(eligible, key=lambda r: r["summary"]["duration_s"])["id"] if eligible else None


if __name__ == "__main__":
    baseline = run(["routing.test_scenarios"])
    mutations = []
    for name, target, mutant, test in [
        (
            "55_mph_wrongly_eligible",
            "classify",
            low_wind_limit,
            "test_500_combined_weather_load_cases",
        ),
        (
            "load_threshold_wrongly_inclusive",
            "classify",
            nonstrict_load,
            "test_golden_route_decisions",
        ),
        ("time_wrongly_before_risk", "recommendation", fastest, "test_golden_route_decisions"),
    ]:
        with patch(f"routing.test_scenarios.{target}", mutant):
            result = run([f"routing.test_scenarios.ScenarioTests.{test}"])
        mutations.append(
            {
                "mutation": name,
                "detected": bool(result.failures) and not result.errors,
                "failing_checks": len(result.failures) + len(result.errors),
            }
        )
    report = {
        "baseline_passed": baseline.wasSuccessful(),
        "test_methods": baseline.testsRun,
        "golden_scenarios": baseline.scenarios,
        "combined_weather_load_cases": 500,
        "mutations": mutations,
        "limits": [
            "Synthetic policy evidence, not fleet outcomes.",
            "10-mile samples detect the narrow test storm; 25/50-mile samples miss it.",
            "Three selected mutations are not an exhaustive mutation score.",
        ],
    }
    target = ROOT / "output/scenario-evaluation.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not baseline.wasSuccessful() or not all(m["detected"] for m in mutations):
        raise SystemExit(1)
