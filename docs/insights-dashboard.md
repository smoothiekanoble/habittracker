# Insights dashboard

The `/insights` route uses all of the signed-in user's `daily_metrics` history. Reads are paginated in batches of 500 to avoid the default Supabase row limit. No migration or new ingestion workflow is required.

## Modules and controls

- Sleep duration: daily values, a seven-calendar-day mean, and a configurable personal target.
- Body weight: daily values, seven-day means, and the change between the most recent two calendar-week windows.
- Sleep score, stages, overnight heart rate, and overnight stress: optional Garmin measurements; absent metrics show an empty state.
- Sleep consistency: duration standard deviation and mean duration grouped by weekday, with sample counts.
- Duration versus score: paired nights only. Garmin's score includes duration; this is not an independent relationship or a prediction.
- Coverage: available measurement dates, latest dates, and actual provider names for each metric.
- Explorer: any stored metric, per source, with a readings table in original units.

Date ranges are 28, 90, 180 days or all history. Customize opens module visibility/reordering, averages, bars/lines, and the sleep target. Weight can be displayed in pounds or kilograms. Preferences are scoped to the current user and saved in this browser's local storage. They do not sync across devices.

## Data interpretation

Missing dates stay as gaps, never zero or interpolated measurements. A seven-day mean requires three measurements in that seven-day window and is only drawn on observed days. Means at the beginning of a selected range use the available days in that range. Weekly weight comparisons state the actual number of measurements. These are changes in measurements, not prescriptions for cutting weight or choosing training intensity.

Weight units are converted explicitly; unsupported units are omitted from the weight chart. Main charts prefer MedM for weight and Garmin for sleep when multiple providers overlap, choosing the most recently updated value within a provider. The explorer lets each source be inspected separately. Optional metrics are never inferred from other metrics.

Dashboard design emphasizes trends and the underlying measurements, following [AIS guidance on wearable metrics](https://www.ausport.gov.au/ais/gmr/mental_performance_in_competition/science/wearables). Sustained changes can provide context, but vendor recovery scores do not determine whether an athlete can perform. Lifting volume, RPE, and strength progress require a future training-log integration.

## Local checks

From `web`, run `npm run test:insights`, `npm exec tsc -- --noEmit --incremental false`, and `npm run lint`. The calculation tests cover unit conversion, missing dates, provider precedence, invalid scores, and calendar-window averaging, then render all modules using synthetic data. QA files are generated under ignored `local-data/dashboard-preview/`.

An optional interactive browser check runs with `node scripts/test-health-insights.cjs --browser` when Playwright is installed or available via `NODE_PATH`. Set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge. It checks visibility/order persistence, range controls, the readings table, visible chart heights, and horizontal overflow at 390, 768, and 1440 pixels, and writes desktop/mobile screenshots using synthetic data only.

Run production builds in CI or stop the dev server first: `next dev` and `next build` share the `.next` directory.
