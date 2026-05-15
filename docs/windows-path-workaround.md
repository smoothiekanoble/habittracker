# Windows: Project path containing `&` (e.g. Texas A&M)

## Why `&` breaks npm on Windows

On Windows, npm runs package scripts (e.g. `postinstall`, `next dev`) via **batch files** (`.cmd`) when using the default shell. In batch/cmd, **`&` is a command separator**. So a path like:

`C:\Users\you\OneDrive - Texas A&M University\Projects\habittracker\...`

is interpreted as: run something with `C:\Users\you\OneDrive - Texas A`, then run **`M`** as a new command. That produces errors such as:

- **`'M' is not recognized as an internal or external command`**
- **`Cannot find module 'C:\Users\you\napi-postinstall\...'`** or **`C:\Users\you\next\...`** — the path is truncated at `&`, so Node looks under your user profile instead of `...\habittracker\web\node_modules\...`.

The fix is to run npm from a path that does **not** contain `&`.

## How the subst workaround works

**subst** creates a virtual drive letter (e.g. `H:`) that points at a folder. Everything under `H:\` is actually under your real folder (e.g. `...\Texas A&M University\...\habittracker`). When you run `npm install` and `npm run dev` from `H:\web`, the path seen by batch scripts is `H:\web\...` — no `&`, so nothing is truncated. When you’re done, you remove the drive with `subst H: /D`. Your files stay where they are; only the mapping is removed.

---

## Option A: Helper script (recommended)

The script maps `H:`, runs `npm install` and `npm run dev` under `H:\web`, and **always unmaps `H:` when it exits** (normal exit, npm error, Ctrl+C, or Next.js exit). If the script was killed (e.g. closing the terminal), see [Cleanup](#cleanup-if-the-script-exited-unexpectedly) below.

**Run from PowerShell** (from repo root or any folder):

```powershell
cd "C:\Users\...\OneDrive - Texas A&M University\Projects\habittracker\habittracker"
.\scripts\run-web-subst.ps1
```

To listen on all interfaces (test on your phone at `http://<PC_LAN_IP>:3000`):

```powershell
.\scripts\run-web-subst.ps1 -Lan
```

To run from another directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\...\habittracker\scripts\run-web-subst.ps1"
```

Use your real repo path (the one that contains `scripts\run-web-subst.ps1`). Replace the path with `&` by the full path in quotes as above.

---

## Option B: Manual subst

1. Open **Command Prompt** or **PowerShell**.

2. Map a drive to the repo root (use your actual path in quotes):
   ```bat
   subst H: "C:\Users\you\OneDrive - Texas A&M University\Projects\habittracker\habittracker"
   ```
   You can use another free letter (e.g. `Z:`) instead of `H:`.

3. Use that drive for npm:
   ```bat
   H:
   cd \web
   npm install
   npm run dev
   ```

   For LAN / phone testing, use `npm run dev:lan` instead of `npm run dev` (same `H:\web` folder).

4. When finished, remove the drive:
   ```bat
   subst H: /D
   ```
   This only removes the mapping; it does not delete any files.

---

## Cleanup if the script exited unexpectedly

If you closed the terminal or the script was killed before it could unmap the drive, `H:` may still be mapped. To remove it:

```bat
subst H: /D
```

Run in Command Prompt or PowerShell. If the script uses a different drive letter, use that letter instead of `H:`.

---

## Alternative: move or clone the repo

Clone or copy the repo to a path **without** `&`, for example:

- `C:\dev\habittracker`
- `C:\Projects\habittracker`

Then run `cd web`, `npm install`, and `npm run dev` from that location. No subst or script needed.
