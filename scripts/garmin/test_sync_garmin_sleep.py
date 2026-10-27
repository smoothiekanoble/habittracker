#!/usr/bin/env python3
"""Pure tests for Garmin normalization and the canonical daily_metrics shape."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("sync_garmin_sleep.py")
SPEC = importlib.util.spec_from_file_location("sync_garmin_sleep", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class GarminNormalizationTests(unittest.TestCase):
    def test_normalizes_high_signal_sleep_metrics_to_existing_schema(self) -> None:
        payload = {
            "dailySleepDTO": {
                "sleepTimeSeconds": 28800,
                "deepSleepSeconds": 5400,
                "lightSleepSeconds": 14400,
                "remSleepSeconds": 7200,
                "awakeSleepSeconds": 1800,
                "sleepScore": 82,
                "averageHeartRate": 52,
            }
        }

        rows = MODULE.normalize_sleep(
            MODULE.date(2026, 10, 21), payload, "user-1"
        )
        serialized = MODULE.rows_as_json(rows)

        self.assertEqual(len(serialized), 7)
        self.assertTrue(all(row["metric_date"] == "2026-10-21" for row in serialized))
        self.assertTrue(all(row["source"] == "garmin" for row in serialized))
        self.assertTrue(all("date" not in row and "provider" not in row for row in serialized))
        self.assertEqual(serialized[0]["source_detail"]["provider"], "garmin_connect")
        self.assertEqual(
            {row["metric_type"] for row in serialized},
            {
                "sleep_minutes",
                "deep_sleep_minutes",
                "light_sleep_minutes",
                "rem_sleep_minutes",
                "awake_minutes",
                "sleep_score",
                "avg_sleep_hr",
            },
        )

    def test_date_window_is_oldest_to_newest(self) -> None:
        self.assertEqual(
            MODULE.date_window(MODULE.date(2026, 10, 21), 3),
            [
                MODULE.date(2026, 10, 19),
                MODULE.date(2026, 10, 20),
                MODULE.date(2026, 10, 21),
            ],
        )

    def test_accepts_nested_sleep_score_and_numeric_strings(self) -> None:
        payload = {
            "dailySleepDTO": {
                "sleepTimeSeconds": "27000",
                "sleepScores": {"overall": {"value": 76}},
            }
        }

        rows = MODULE.normalize_sleep(MODULE.date(2026, 10, 21), payload, "user-1")
        serialized = MODULE.rows_as_json(rows)

        self.assertEqual(
            {row["metric_type"] for row in serialized},
            {"sleep_minutes", "sleep_score"},
        )
        self.assertEqual(serialized[0]["value"], 450.0)


if __name__ == "__main__":
    unittest.main()
