# Backend-First Refactor: Final Architecture Review and Implementation Checklist

---

## 1. Final Architecture Confirmation

### Internal consistency

- **Supabase** is the only persistent source of truth for `habits` and `habit_logs`. The web app already reads and writes only via Supabase with RLS. No schema or migration changes.
- **Web** is the primary client. It will consume **shared** for domain types only; all data access stays in the web app via the existing Supabase client. No new service layer.
- **shared** is types-only (Habit, HabitLog, WidgetSnapshot, WidgetHabitEntry). No business logic, no build step; the web bundler compiles it. This matches “canonical domain contract” without pulling in Supabase or React.
- **iOS** is unchanged in this refactor. Future behavior (fetch from Supabase, reconcile snapshot to backend, build snapshot from backend data) is documented only. No conflicting design: backend is canonical, iOS will be a client.

### Widget architecture compatibility

- The **widget snapshot format** (denormalized: `habits[]` with id, title, isCompletedToday, displayColor, displayIcon, displayOrder; `lastUpdated` ISO string) is unchanged and is reflected in shared as `WidgetSnapshot` / `WidgetHabitEntry`. The iOS widget and App Group contract remain valid.
- **Model A** (widget writes toggles into the snapshot; app reconciles) is preserved. The only change is *what* “reconcile” means: instead of writing into local SwiftData, the future iOS app will write to Supabase (upsert/delete `habit_log` for today per habit), then refetch and rebuild the snapshot. The widget extension code and snapshot shape do not need to change.
- **Who writes the snapshot**: Today only the iOS app can write it (to App Group). The web app does not produce or consume the widget snapshot. shared’s `WidgetSnapshot` type is the **contract** so that when iOS is implemented, its payload matches the same shape. No conflict.

### Shared types as canonical domain contract

- **Habit**: Matches Supabase `habits` row (id, user_id, title, color, icon, created_at, updated_at). Web and future iOS can both use this for API/DB alignment.
- **HabitLog**: Matches Supabase `habit_logs` row (id, habit_id, date, completed, created_at). Same use.
- **WidgetSnapshot** / **WidgetHabitEntry**: Match the existing iOS `WidgetPayload` and docs/widget-snapshot.md. No extra fields; no logic. Shared is the single TypeScript definition of this contract so web (if it ever needs to reason about the snapshot) and docs stay aligned with iOS.

**Verdict:** The refined architecture is internally consistent. The widget design remains compatible with a backend-first model. Shared types correctly represent the canonical domain contract.

---

## 2. Remaining Risks (if any)

- **Minimal.**  
  - **Dependency link:** Using `"file:../shared"` assumes the repo is always cloned with `shared/` next to `web/`. CI and local runs must use the same layout (no copying web without shared). Standard for a monorepo.  
  - **Type drift:** If Supabase or the widget payload shape changes, shared types and docs must be updated. No automated contract test in this refactor; manual discipline.  
  - **iOS later:** The checklist does not implement any iOS code. When implementing on macOS, follow the documented reconcile algorithm exactly so the widget and backend stay in sync.

---

## 3. Implementation Checklist

Execute in order. Do not add new abstractions or move logic into shared.

---

### Workspace and shared package setup

| Step | Action |
|------|--------|
| 1 | Create directory `shared/` at repo root (sibling to `web/`, `supabase/`, `ios/`, `docs/`). |
| 2 | Create `shared/package.json` with: `"name": "@habittracker/shared"`, `"version": "0.1.0"`, `"private": true`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, `"exports": { ".": { "types": "./src/index.ts" } }`. No dependencies. No scripts. |
| 3 | Create `shared/tsconfig.json` with: `{ "compilerOptions": { "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["src/**/*.ts"] }`. (No emit; web compiles shared.) |
| 4 | Create `shared/src/types/habit.ts` defining and exporting: `Habit` (id, user_id, title, color, icon, created_at, updated_at: all string), `HabitLog` (id, habit_id, date, completed, created_at: id/habit_id/date/created_at string, completed boolean). Use snake_case. |
| 5 | Create `shared/src/types/widget-snapshot.ts` defining and exporting: `WidgetHabitEntry` (id, title, isCompletedToday, displayColor, displayIcon, displayOrder), `WidgetSnapshot` (habits: WidgetHabitEntry[], lastUpdated: string). Match existing iOS/docs shape. |
| 6 | Create `shared/src/index.ts` that re-exports from `./types/habit` and `./types/widget-snapshot` (e.g. `export type { Habit, HabitLog } from "./types/habit";` and `export type { WidgetSnapshot, WidgetHabitEntry } from "./types/widget-snapshot";`). |

---

### Web dependency and types

| Step | Action |
|------|--------|
| 7 | In `web/package.json`, add under `"dependencies"`: `"@habittracker/shared": "file:../shared"`. |
| 8 | Run from repo root or from `web/`: `cd web && npm install` so the shared package is linked. |

---

### Web file edits (remove inline types; use shared)

| Step | Action |
|------|--------|
| 9 | **web/src/lib/supabase.ts**: Remove the two `export type` blocks (Habit and HabitLog). Add at top: `export type { Habit, HabitLog } from "@habittracker/shared";`. Leave `createClient` and all other code unchanged. |
| 10 | **web/src/components/TodayPage.tsx**: Change the import from `import { createClient, type Habit, type HabitLog } from "@/lib/supabase";` to `import { createClient } from "@/lib/supabase";` and `import type { Habit, HabitLog } from "@habittracker/shared";` (or keep a single import from `@/lib/supabase` if step 9 re-exports types). After step 9, importing from `@/lib/supabase` is enough since it re-exports shared types. So: no change to TodayPage import if supabase re-exports; otherwise add `import type { Habit, HabitLog } from "@habittracker/shared";` and remove type imports from supabase. **Recommended:** Keep one place: supabase.ts re-exports shared types; all components keep importing `createClient` and types from `@/lib/supabase` only. Then no change needed in TodayPage, HabitForm, HabitsListPage, HabitDetailPage imports. |
| 11 | **web/src/components/HabitForm.tsx**: Ensure `Habit` is imported from `@/lib/supabase` (or from `@habittracker/shared` if not re-exporting). If supabase re-exports (step 9), no import change. |
| 12 | **web/src/components/HabitsListPage.tsx**: Same as HabitForm; no import change if supabase re-exports. |
| 13 | **web/src/components/HabitDetailPage.tsx**: Ensure `Habit` is imported from `@/lib/supabase` (or `@habittracker/shared`). Keep the local `type Log = { date: string; completed: boolean }`; do not add to shared. No other change. |

**Import strategy (recommended):** After step 9, `@/lib/supabase` is the only place web imports types from; it re-exports from shared. So steps 10–13 are “verify only”: no edits to component imports if they already use `@/lib/supabase` for types.

---

### README and run instructions

| Step | Action |
|------|--------|
| 14 | **README.md**: Rewrite the “Repo structure” section so order is: **web/** (primary client), **supabase/** (canonical backend), **shared/** (domain types only), **ios/** (future client), **docs/**. |
| 15 | **README.md**: Add a **“Run on Windows (web + backend)”** section at the top (or immediately after repo structure). State: No Xcode or macOS required. Steps: (1) Apply Supabase migrations and configure Google auth + redirect URL; (2) Copy `web/.env.local.example` to `web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; (3) Run `cd web && npm install && npm run dev`; (4) Open http://localhost:3000. |
| 16 | **README.md**: Move the current “iOS app” and “Web app” sections so that “Web app” (or “Run on Windows”) comes first and “iOS app” is clearly “later (macOS)”. Optionally retitle “Web app” to “Web app (primary client)” and “iOS app” to “iOS app (future, macOS)”. |
| 17 | **README.md**: In the Backend section, keep the same Supabase migration instructions. Add a one-line note that the backend is the canonical source of truth for habits and habit logs. |

---

### Documentation updates

| Step | Action |
|------|--------|
| 18 | **docs/schema.md**: At the top (after the title), add a short paragraph: “Supabase is the canonical source of truth for habits and habit_logs. The web app is the primary client; the iOS app (when implemented) will consume the same Supabase API. Domain types (TypeScript) live in the `shared/` package.” |
| 19 | **docs/widget-snapshot.md**: In “Who writes”, add a sentence: “The web app does not write the widget snapshot; only the iOS app does. When implemented, the iOS app will build the snapshot from data fetched from Supabase (or from a local cache updated from Supabase), then write to App Group.” Add a **“Future iOS reconciliation”** subsection: “On app activate: (1) Read snapshot from App Group. (2) For each habit in snapshot: if `isCompletedToday` is true, upsert `habit_log` for (habit_id, today) with completed true; else delete any `habit_log` for (habit_id, today). (3) Refetch habits and today’s logs from Supabase. (4) Build new snapshot from that data. (5) Write snapshot to App Group. (6) Call WidgetCenter.reloadAllTimelines().” |

---

### Verification

| Step | Action |
|------|--------|
| 20 | From repo root: `cd web && npm install && npm run dev`. Confirm the app runs and that no imports reference `ios/` or a missing module. |
| 21 | Confirm `shared/` contains no business logic and no build script; only type definitions and re-exports. |
| 22 | Confirm Supabase migrations under `supabase/migrations/` are unchanged. |

---

### Optional (iOS comments only)

| Step | Action |
|------|--------|
| 23 | **(Optional)** In `ios/HabitTracker/Core/Sync/SyncService.swift`, add a short comment above the type: “When implementing on macOS: this type will become the Supabase backend client (fetch habits, fetch today’s logs, toggle completion). Reconciler will apply widget snapshot state to Supabase then refetch. See docs/widget-snapshot.md.” No code changes. |

---

## Summary

- **Create:** `shared/` package (package.json, tsconfig.json, `src/types/habit.ts`, `src/types/widget-snapshot.ts`, `src/index.ts`).
- **Edit:** `web/package.json` (add shared dependency), `web/src/lib/supabase.ts` (remove inline types; re-export from shared), `README.md` (structure order, Windows-first run, backend canonical note), `docs/schema.md` (canonical source + shared note), `docs/widget-snapshot.md` (who writes, future iOS reconciliation steps).
- **Imports:** Web continues to import `createClient` and types from `@/lib/supabase`; supabase.ts becomes the re-export point for shared types. No new service layer; no logic in shared.
- **No changes:** Supabase schema, iOS code (except optional comment), widget snapshot format or iOS widget code.
