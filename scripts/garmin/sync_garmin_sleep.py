#!/usr/bin/env python3
"""Garmin sleep daily_metrics sync spike.

This script intentionally keeps credentials in environment variables, token
cache under local-data/, and raw Garmin JSON out of git.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib import parse, request


GARMIN_SLEEP_ENDPOINT = (
    "/gc-api/sleep-service/sleep/dailySleepData"
    "?date={date}&nonSleepBufferMinutes=60"
)
DEFAULT_TOKENSTORE = Path("local-data/garmin/tokens")
RAW_SLEEP_DIR = Path("local-data/garmin/raw-sleep")
DRY_RUN_USER_ID = "00000000-0000-0000-0000-000000000000"


@dataclass(frozen=True)
class DailyMetric:
    user_id: str
    metric_date: str
    metric_type: str
    value: float
    unit: str
    source: str
    source_detail: dict[str, str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Garmin sleep data into daily_metrics.")
    parser.add_argument("--date", help="End date in YYYY-MM-DD format. Defaults to today.")
    parser.add_argument("--days", type=int, default=1, help="Number of days to fetch, ending at --date.")
    parser.add_argument("--dry-run", action="store_true", help="Print normalized rows without upserting.")
    parser.add_argument("--upsert", action="store_true", help="Upsert normalized rows to Supabase.")
    parser.add_argument("--save-raw", action="store_true", help="Save raw JSON under local-data/garmin/raw-sleep.")
    return parser.parse_args()


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def parse_day(value: str | None) -> date:
    if not value:
        return date.today()
    return datetime.strptime(value, "%Y-%m-%d").date()


def date_window(end_date: date, days: int) -> list[date]:
    if days < 1:
        raise ValueError("--days must be at least 1")
    return [end_date - timedelta(days=offset) for offset in reversed(range(days))]


def ensure_garmin_client() -> Any:
    try:
        from garminconnect import Garmin
    except ImportError as exc:
        raise SystemExit(
            "Missing dependency: garminconnect. Install with: pip install garminconnect curl_cffi"
        ) from exc

    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    tokenstore = Path(os.getenv("GARMINTOKENS", str(DEFAULT_TOKENSTORE)))
    os.environ["GARMINTOKENS"] = str(tokenstore)
    tokenstore.mkdir(parents=True, exist_ok=True)

    if not email or not password:
        raise SystemExit("GARMIN_EMAIL and GARMIN_PASSWORD are required.")

    client = Garmin(email, password, prompt_mfa=lambda: input("Garmin MFA code: "))
    client.login(str(tokenstore))
    return client


def fetch_sleep_json(client: Any, day: date) -> dict[str, Any]:
    day_str = day.isoformat()
    try:
        payload = client.get_sleep_data(day_str)
        if isinstance(payload, dict) and payload:
            return payload
    except Exception as exc:
        print(f"get_sleep_data failed for {day_str}, falling back to gc-api endpoint: {exc}", file=sys.stderr)

    endpoint = GARMIN_SLEEP_ENDPOINT.format(date=day_str)
    payload = client.connectapi(endpoint)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected Garmin sleep payload for {day_str}: {type(payload).__name__}")
    return payload


def save_raw(day: date, payload: dict[str, Any]) -> None:
    RAW_SLEEP_DIR.mkdir(parents=True, exist_ok=True)
    output = RAW_SLEEP_DIR / f"{day.isoformat()}.json"
    output.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def numeric_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value.strip())
        except ValueError:
            return None
        return parsed if parsed == parsed else None
    if isinstance(value, dict):
        for nested_key in ("value", "score", "overall"):
            if nested_key in value:
                parsed = numeric_value(value[nested_key])
                if parsed is not None:
                    return parsed
    return None


def first_number(payload: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = numeric_value(payload.get(key))
        if value is not None:
            return value
    return None


def minutes_from_seconds(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value / 60, 4)


def normalize_sleep(day: date, payload: dict[str, Any], user_id: str) -> list[DailyMetric]:
    daily = payload.get("dailySleepDTO")
    source_payload = daily if isinstance(daily, dict) else payload
    day_str = day.isoformat()
    rows: list[DailyMetric] = []

    def add(metric_type: str, value: float | None, unit: str = "minutes") -> None:
        if value is None:
            return
        rows.append(
            DailyMetric(
                user_id=user_id,
                metric_date=day_str,
                metric_type=metric_type,
                value=value,
                unit=unit,
                source="garmin",
                source_detail={
                    "provider": "garmin_connect",
                    "endpoint": "dailySleepData",
                },
            )
        )

    add("sleep_minutes", minutes_from_seconds(first_number(source_payload, "sleepTimeSeconds", "sleepTime")))
    add("deep_sleep_minutes", minutes_from_seconds(first_number(source_payload, "deepSleepSeconds", "deepSleepTime")))
    add("light_sleep_minutes", minutes_from_seconds(first_number(source_payload, "lightSleepSeconds", "lightSleepTime")))
    add("rem_sleep_minutes", minutes_from_seconds(first_number(source_payload, "remSleepSeconds", "remSleepTime")))
    add("awake_minutes", minutes_from_seconds(first_number(source_payload, "awakeSleepSeconds", "awakeTime")))
    add(
        "sleep_score",
        first_number(source_payload, "sleepScore", "sleepScoresOverall", "sleepScores"),
        "score",
    )
    add("avg_sleep_stress", first_number(source_payload, "averageStressDuringSleep", "avgSleepStress"), "score")
    add("avg_sleep_hr", first_number(source_payload, "averageHeartRate", "avgSleepHr"), "bpm")

    return rows


def rows_as_json(rows: list[DailyMetric]) -> list[dict[str, Any]]:
    return [row.__dict__ for row in rows]


def upsert_supabase(rows: list[DailyMetric]) -> None:
    if not rows:
        return

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --upsert.")

    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/daily_metrics?"
        + parse.urlencode({"on_conflict": "user_id,metric_date,metric_type,source"})
    )
    payload = json.dumps(rows_as_json(rows)).encode("utf-8")
    req = request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with request.urlopen(req, timeout=30) as response:
        if response.status not in (200, 201, 204):
            raise RuntimeError(f"Supabase upsert failed with HTTP {response.status}")


def main() -> int:
    load_dotenv(Path(".env.local"))
    load_dotenv(Path("scripts/garmin/.env.local"))
    args = parse_args()
    if args.upsert and args.dry_run:
        raise SystemExit("Choose either --dry-run or --upsert, not both.")
    if not args.upsert:
        args.dry_run = True

    user_id = os.getenv("HABITTRACKER_USER_ID") or DRY_RUN_USER_ID
    if args.upsert and user_id == DRY_RUN_USER_ID:
        raise SystemExit("HABITTRACKER_USER_ID is required.")

    client = ensure_garmin_client()
    all_rows: list[DailyMetric] = []
    for day in date_window(parse_day(args.date), args.days):
        payload = fetch_sleep_json(client, day)
        print(f"{day.isoformat()} top-level keys: {sorted(payload.keys())}")
        if args.save_raw:
            save_raw(day, payload)
        day_rows = normalize_sleep(day, payload, user_id)
        if not day_rows:
            daily = payload.get("dailySleepDTO")
            known_keys = (
                "sleepTimeSeconds",
                "deepSleepSeconds",
                "lightSleepSeconds",
                "remSleepSeconds",
                "awakeSleepSeconds",
                "sleepScore",
                "sleepScores",
                "averageHeartRate",
            )
            present_keys = [key for key in known_keys if isinstance(daily, dict) and daily.get(key) is not None]
            detail = ", ".join(present_keys) if present_keys else "no measured sleep fields"
            print(f"{day.isoformat()} no normalized sleep metrics ({detail})")
        all_rows.extend(day_rows)

    print(json.dumps(rows_as_json(all_rows), indent=2, sort_keys=True))
    if args.upsert:
        upsert_supabase(all_rows)
        print(f"Upserted {len(all_rows)} daily_metrics rows.")
    else:
        print(f"Dry run only. Prepared {len(all_rows)} daily_metrics rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
