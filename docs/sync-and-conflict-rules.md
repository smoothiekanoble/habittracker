# Sync and Conflict Rules

## Source of truth

- **Immediate (iOS)**: SwiftData is the immediate source of truth. App Group snapshot is a display cache for the widget; app and widget (Model A) can write to it.
- **Sync / cross-platform**: Supabase is the synchronization and cross-platform source of truth. Not the immediate interaction source of truth on device.

## Sync direction

- **Push**: On any local change (app or after reconciling widget snapshot), app pushes inserts/updates to Supabase.
- **Pull**: On app launch/foreground, optionally pull latest from Supabase and merge.

## Conflict resolution

- **Strategy**: Last-write-wins by `updated_at` (for habits) and by presence/timestamp for logs.
- **habit_logs**: Idempotent by `(habit_id, date)`. Upsert per day; no duplicate rows per habit per day. Last write (by `created_at` or server timestamp) wins if both sides edited the same day.
- **habits**: Compare `updated_at`; keep the row with the later `updated_at`. On tie, keep local or remote consistently (e.g. keep local).

## Reconciliation (widget → app)

- When app launches or returns to foreground: read widget snapshot from App Group, compare “today” completion state to SwiftData, apply any differences (widget toggles) into SwiftData, rewrite snapshot, call `WidgetCenter.reloadAllTimelines()`.
- Snapshot is authoritative for “today” at reconcile time; no conflict resolution needed for MVP (single device, single user).

## Edge cases

- **Offline**: App and widget work fully offline. When back online, app syncs local changes to Supabase.
- **Multi-device (later)**: Pull on launch merges remote changes; last-write-wins. Single user MVP minimizes conflicts.
