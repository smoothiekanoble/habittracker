# Habit Tracker MVP

Low-friction habit tracking. Web app is the primary client; iOS app and widget are planned for later.

## Web + Backend (Windows)

No macOS or Xcode required. Run the app with Supabase as the backend:

1. **Backend:** Create a project at [supabase.com](https://supabase.com). Apply migrations from `supabase/migrations/` (Dashboard SQL or `npx supabase db push`). Enable Google under Authentication → Providers and add redirect URL `http://localhost:3000/auth/callback`.

2. **Environment:** Copy `web/.env.local.example` to `web/.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

3. **Run:**
   ```bash
   cd web
   npm install
   npm run dev
   ```
   Open http://localhost:3000. Sign in with Google; use Today, habits list, create/edit, toggle completion.

   **Phone on same Wi‑Fi (no native app):** Run Next on `0.0.0.0` (`npm run dev:lan` or `.\scripts\run-web-subst.ps1 -Lan`), then open `http://<PC_LAN_IP>:3000` on the phone. For **Google OAuth**, if the dev server never logs `GET /auth/callback`, Supabase is probably sending the browser to `localhost` instead of your PC. Set `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN=http://<PC_LAN_IP>:3000` in `web/.env.local` (see `web/.env.local.example`), restart dev, and in Supabase **Authentication → URL configuration** set **Site URL** and **Redirect URLs** to that same origin (including `…/auth/callback`).

   **Windows path with `&` (e.g. Texas A&M in the folder name):** Do **not** run `npm run dev` or `npm run dev:lan` from the long path — cmd breaks on `&`. From the **repo root** in PowerShell run `.\scripts\run-web-subst.ps1` (normal dev) or `.\scripts\run-web-subst.ps1 -Lan` (phone/LAN). See [Windows path workaround](docs/windows-path-workaround.md).

4. **Deploy v1:** Use Vercel with root directory `web`, add the Supabase public URL and anon key, then update Supabase Auth redirect URLs for the production domain. See [Web deployment checklist](docs/web-deployment.html).

## Repo structure

- **web/** — Next.js app (primary client)
- **supabase/** — Migrations and config (canonical backend)
- **shared/** — Canonical domain types only (Habit, HabitLog, WidgetSnapshot)
- **ios/** — Future iOS app and widget (macOS/Xcode)
- **docs/** — Schema, widget snapshot contract, sync rules

### What you can test on Windows vs Mac

| Goal | Where |
|------|--------|
| Full habits UI (today, list, edit, Supabase, Google sign-in) | **web/** on Windows (browser or phone Safari / Add to Home Screen) |
| Compile **ios/** without a Mac | GitHub Actions (`.github/workflows/ios-build.yml`) — build only, no simulator UI |
| Run **SwiftUI app** or **iOS Simulator** | **Mac + Xcode only** — Apple does not ship iOS tooling for Windows |
| **Home screen widget** (App Group, `WidgetExtension`) | **Mac + Xcode** (sim or device); there is no Windows runtime for that |

The refactor checklist explicitly made **“Run on Windows (web + backend)”** the full test path without Xcode ([`docs/REFACTOR-IMPLEMENTATION-CHECKLIST.md`](docs/REFACTOR-IMPLEMENTATION-CHECKLIST.md) steps 15–16, 20). **`ios/`** was always a separate native client, not something Xcode-free Windows could execute.

## Backend (Supabase)

From repo root:

```bash
npx supabase init   # if not already
npx supabase link   # link to your project
npx supabase db push   # apply migrations from supabase/migrations
```

## iOS app (macOS / Xcode)

Native SwiftUI + SwiftData lives under `ios/`. You cannot build it on Windows; use a Mac or rely on CI (see below).

### Open and run

1. Open `ios/HabitTracker.xcodeproj` in Xcode.
2. Select the **HabitTracker** scheme and an **iOS 17+** simulator or device.
3. **Signing:** Add your Apple ID under Signing & Capabilities for the **HabitTracker** and **HabitTrackerWidgetExtension** targets.
4. **App Group:** Both targets must include App Group `group.com.habittracker.app` (see `HabitTracker/HabitTracker.entitlements` and `HabitTrackerWidget/HabitTrackerWidget.entitlements`). If you change the identifier in Xcode, update both entitlements and keep them identical.

### Widget

1. Run the main app once on the simulator or device.
2. On the Home Screen, add the **Habit Widget** (or run the widget extension scheme from Xcode for debugging).
3. Widget data is refreshed when the app becomes active; see `HabitTrackerApp` and [Widget snapshot](docs/widget-snapshot.md).

### Supabase sync (optional)

The app pulls and pushes `habits` / `habit_logs` when:

- `SupabaseConfig.plist` is present in the app bundle (copy `ios/HabitTracker/Resources/SupabaseConfig.example.plist` → `SupabaseConfig.plist`, add **only** `SupabaseConfig.plist` to the HabitTracker target under **Copy Bundle Resources**; do not commit secrets), and  
- The user has a valid `supabase.auth` session.

There is no Google sign-in UI in the iOS template yet; until you add OAuth (for example `signInWithOAuth` + `onOpenURL` / `supabase.handle(url)`), sync stays a no-op. Rules for merge behavior are in [Sync and conflict rules](docs/sync-and-conflict-rules.md).

### CI build (no Mac handy)

Pushes that touch `ios/` run **iOS build** on GitHub Actions (`.github/workflows/ios-build.yml`): Xcode resolves the [supabase-swift](https://github.com/supabase/supabase-swift) package and builds the **HabitTracker** scheme for the iOS Simulator.

## Docs

- [Schema](docs/schema.md) — Supabase tables and local (iOS) schema
- [Widget snapshot](docs/widget-snapshot.md) — App Group payload shape and future iOS reconciliation
- [Sync and conflict rules](docs/sync-and-conflict-rules.md)
- [Windows path workaround](docs/windows-path-workaround.md) — If your path contains `&` (e.g. Texas A&M)
