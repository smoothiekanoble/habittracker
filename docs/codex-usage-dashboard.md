# Codex Usage Dashboard

This feature shows Codex usage on the Today page from Supabase snapshots.

OpenAI does not currently expose a clean personal ChatGPT/Codex limits API for the app to call directly. Official docs point to the Codex Usage Dashboard for current limits, and the interactive Codex CLI `/status` command for active local sessions. The OpenAI Platform Usage API is for API organization usage/costs, not ChatGPT plan limits.

## How it works

1. The local importer opens `https://chatgpt.com/codex/settings/usage` in a dedicated Chrome/Edge profile.
2. It reads the visible dashboard text through Chrome's local debug protocol.
3. It stores an `ok` or `error` snapshot in `public.codex_usage_snapshots`.
4. It also reads local Codex session metadata from `CODEX_HOME\sessions` and upserts a sanitized daily summary to `public.codex_daily_usage_stats`.
5. The Today page reads the latest snapshots and current-month daily stats through normal Supabase auth/RLS.

If the dashboard changes and parsing breaks, the importer writes an error snapshot so the app shows an alert instead of silently going stale.

## Setup

1. Apply these migrations:
   - `supabase/migrations/20260517000000_create_codex_usage_snapshots.sql`
   - `supabase/migrations/20260517001000_create_codex_daily_usage_stats.sql`
2. Copy `scripts/codex-usage.env.example` to `scripts/codex-usage.env`.
3. Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CODEX_USAGE_USER_ID`
4. Run from the repo root:

```powershell
node scripts/import-codex-usage.mjs
```

The first run may open a browser profile that is not logged in. Sign in to ChatGPT/Codex in that window, then run the script again.

## Scheduling

For hourly refresh on Windows, create a Task Scheduler task that runs:

```powershell
node C:\Users\danie\.codex\worktrees\3062\habittracker\scripts\import-codex-usage.mjs
```

Set the task's "Start in" directory to:

```text
C:\Users\danie\.codex\worktrees\3062\habittracker
```

Keep `scripts/codex-usage.env` local and uncommitted. It contains a Supabase service role key.

The daily stats table stores counts and percentages only. It does not store prompts, responses, command output, or full Codex session JSONL content.
