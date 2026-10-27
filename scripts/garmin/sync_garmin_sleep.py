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
    parser.add_argument(
        "--adaptive-lookback",
        action="store_true",
        help="Fetch the full lookback window only when Garmin sleep data is missing.",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=7,
        help="Days to inspect when adaptive lookback is enabled.",
    )
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


def normalize_daily_wellness(client: Any, start: date, end: date, user_id: str) -> list[DailyMetric]:
    """Fetch Garmin's daily totals and normalize the fields exposed by Connect."""
    rows: list[DailyMetric] = []
    requests = (
        ("steps", lambda first, last: client.get_daily_stats(first, last, stats_type="STEPS"), ("totalSteps", "steps", "total_steps"), "steps"),
        ("calories_burned", lambda first, last: client.get_daily_stats(first, last, stats_type="CALORIES"), ("totalKilocalories", "totalCalories", "total_kilocalories"), "kcal"),
        ("daily_stress", lambda first, last: client.get_daily_stress_stats(first, last), ("overallStressLevel", "averageStressLevel", "avgStressLevel", "stress"), "score"),
        ("resting_hr", lambda first, last: client.get_daily_heart_rate_stats(first, last), ("restingHeartRate", "restingHr", "resting_heart_rate"), "bpm"),
    )

    def records(value: Any):
        if isinstance(value, list):
            for item in value:
                yield from records(item)
        elif isinstance(value, dict):
            if any(key in value for key in ("calendarDate", "date", "startDate")):
                yield value
            else:
                for item in value.values():
                    yield from records(item)

    for metric_type, fetch, fields, unit in requests:
        metric_items = []
        cursor = start
        while cursor <= end:
            chunk_end = min(cursor + timedelta(days=27), end)
            try:
                metric_items.extend(records(fetch(cursor.isoformat(), chunk_end.isoformat())))
            except Exception as exc:
                print(f"Garmin {metric_type} fetch unavailable for {cursor}–{chunk_end}: {exc}", file=sys.stderr)
            cursor = chunk_end + timedelta(days=1)
        for item in metric_items:
            raw_date = item.get("calendarDate", item.get("date", item.get("startDate")))
            try:
                day = date.fromisoformat(str(raw_date)[:10])
            except (TypeError, ValueError):
                continue
            if day < start or day > end:
                continue
            value = first_number(item, *fields)
            if value is None:
                continue
            rows.append(DailyMetric(
                user_id=user_id,
                metric_date=day.isoformat(),
                metric_type=metric_type,
                value=value,
                unit=unit,
                source="garmin",
                source_detail={"provider": "garmin_connect", "endpoint": metric_type},
            ))
            if metric_type == "calories_burned":
                active = first_number(item, "activeKilocalories", "activeCalories", "active_kilocalories")
                if active is not None:
                    rows.append(DailyMetric(
                        user_id=user_id,
                        metric_date=day.isoformat(),
                        metric_type="active_calories_burned",
                        value=active,
                        unit="kcal",
                        source="garmin",
                        source_detail={"provider": "garmin_connect", "endpoint": "active_calories"},
                    ))
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


def existing_sleep_dates(end_date: date, days: int, user_id: str) -> set[str]:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --adaptive-lookback."
        )

    start_date = date_window(end_date, days)[0].isoformat()
    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/daily_metrics?"
        + parse.urlencode(
            {
                "select": "metric_date",
                "user_id": f"eq.{user_id}",
                "metric_type": "eq.sleep_minutes",
                "source": "eq.garmin",
                "metric_date": f"gte.{start_date}",
            }
        )
    )
    # Keep the date upper bound explicit while avoiding a second request.
    endpoint += f"&metric_date=lte.{end_date.isoformat()}"
    req = request.Request(
        endpoint,
        method="GET",
        headers={"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"},
    )
    with request.urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"Supabase metric lookup failed with HTTP {response.status}")
        payload = json.loads(response.read().decode("utf-8"))
    return {row["metric_date"] for row in payload if isinstance(row, dict) and row.get("metric_date")}


def choose_fetch_days(
    end_date: date,
    requested_days: int,
    lookback_days: int,
    existing_dates: set[str],
) -> int:
    if lookback_days < 1:
        raise ValueError("--lookback-days must be at least 1")
    lookback_dates = date_window(end_date, lookback_days)
    has_missing = any(day.isoformat() not in existing_dates for day in lookback_dates)
    return max(requested_days, lookback_days) if has_missing else requested_days


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

    end_date = parse_day(args.date)
    if args.adaptive_lookback:
        if not args.upsert:
            raise SystemExit("--adaptive-lookback requires --upsert.")
        existing_dates = existing_sleep_dates(end_date, args.lookback_days, user_id)
        original_days = args.days
        args.days = choose_fetch_days(end_date, args.days, args.lookback_days, existing_dates)
        print(
            f"Adaptive lookback: {len(existing_dates)}/{args.lookback_days} sleep days present; "
            f"fetching {args.days} day(s) instead of {original_days}."
        )

    client = ensure_garmin_client()
    all_rows: list[DailyMetric] = []
    for day in date_window(end_date, args.days):
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

    requested_dates = date_window(end_date, args.days)
    all_rows.extend(normalize_daily_wellness(client, requested_dates[0], requested_dates[-1], user_id))

    print(json.dumps(rows_as_json(all_rows), indent=2, sort_keys=True))
    if args.upsert:
        upsert_supabase(all_rows)
        print(f"Upserted {len(all_rows)} daily_metrics rows.")
    else:
        print(f"Dry run only. Prepared {len(all_rows)} daily_metrics rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
