# Personal Dashboard Data Strategy

The dashboard should help answer a small number of recurring personal questions, not display every field an integration can provide.

## Initial questions

1. Did I sleep enough and consistently this week?
2. Is my sleep quality moving with my habit completion?
3. Is my weight trend changing over weeks rather than reacting to one reading?
4. Which days are missing data, and how much should I trust the trend?

## Data model

- Supabase is the canonical store.
- `daily_metrics` is the dashboard-facing table: one numeric value per user, local metric date, metric type, and source.
- `metric_events` is for integrations that produce multiple timestamped events, such as multiple MedM weigh-ins.
- Garmin sleep initially writes to `daily_metrics` using the existing MedM schema: `metric_date`, `value`, `unit`, `source`, and JSON `source_detail`.
- Raw provider payloads stay local and are only saved explicitly for debugging. They are not dashboard data.

## Signal tiers

### Tier 1: show by default

- `sleep_minutes`
- `sleep_score`
- `deep_sleep_minutes`
- `rem_sleep_minutes`
- `awake_minutes`
- `avg_sleep_hr`
- MedM `body_weight`

These are enough to build a useful first dashboard without pretending that every Garmin field is actionable.

### Tier 2: keep available, hide initially

- `light_sleep_minutes`
- `avg_sleep_stress`
- provider timestamps and sleep-window details

These can support later analysis after data quality and user value are established.

### Tier 3: raw/debug only

Unmapped Garmin JSON, session details, device metadata, and one-off provider fields should not become columns or cards automatically.

## Derived signals

The first dashboard should prefer personal baselines over universal “good/bad” thresholds:

- 7-day rolling median for sleep duration and score.
- Difference from the user’s trailing 28-day median.
- Seven-day data completeness percentage.
- Habit completion rate on days following short, typical, and long sleep.

These are descriptive associations, not medical or causal conclusions. Do not surface correlations until there are enough observations and a clear missing-data warning.

## Dashboard shape

Start with one `/dashboard` page:

1. Three summary cards: last night, 7-day sleep trend, and data freshness.
2. One sleep trend chart with a selectable metric.
3. One habit-versus-sleep comparison using buckets, not a complex model.
4. One weight trend section using weekly smoothing.
5. A compact sources/data-quality panel.

Avoid a separate chart for every metric, health scoring, predictive claims, and red/green medical interpretations.

## Data quality rules

- Store the provider date explicitly; do not silently use the runner’s timezone.
- Upserts must be idempotent.
- Reject impossible or clearly malformed values before writing.
- Track missing days separately from zero values.
- Show source and last-import time in the UI.
- Keep credentials, token caches, and raw health payloads out of git and out of client-side code.

## Delivery sequence

1. Make Garmin conform to the existing schema and validate one day locally.
2. Upsert a small backfill and verify duplicate runs do not create rows.
3. Add read-only dashboard queries and empty/error states.
4. Add rolling summaries and habit comparisons.
5. Enable automation only after authentication and failure recovery are proven.
