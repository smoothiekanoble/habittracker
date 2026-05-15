# Run the web app via a subst drive so paths with "&" (e.g. Texas A&M) don't break npm/cmd.
# Run from REPO ROOT:  .\scripts\run-web-subst.ps1
# LAN / phone:         .\scripts\run-web-subst.ps1 -Lan
# Clean rebuild:       .\scripts\run-web-subst.ps1 -Clean   (deletes web/.next; fixes vendor-chunks MODULE_NOT_FOUND)
# Or: powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-web-subst.ps1" -Lan
#
# Dev server is started with `node …\next\dist\bin\next` (not `npm run`) so Windows never runs
# next.cmd through a path containing "&".

param(
  [switch]$Lan,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Prefer H:; fall back if busy (e.g. VMware or another subst).
# Call subst.exe with two arguments so paths with spaces / "&" in the name are handled safely.
$subst = Join-Path $env:SystemRoot "System32\subst.exe"
$driveLetters = @("H", "J", "K", "Z", "P")
$drive = $null
foreach ($letter in $driveLetters) {
  $d = "${letter}:"
  cmd /c "subst $d /D >nul 2>&1"
  & $subst $d $repoRoot
  if ($?) {
    $drive = $d
    break
  }
}
if (-not $drive) {
  Write-Error "Could not map a subst drive (tried H/J/K/Z/P). Close apps using those letters or run subst from an elevated prompt."
  exit 1
}

$driveMapped = $true
try {
  Write-Host "Mapped ${drive} -> repo root (avoids path-with-& issues)."
  $webDir = "${drive}\web"
  if (-not (Test-Path $webDir)) {
    Write-Error "Expected folder not found: ${webDir}. Run this script from the habittracker repo root."
    exit 1
  }

  Push-Location $webDir
  try {
    if ($Clean) {
      $nextOut = Join-Path $repoRoot "web\.next"
      if (Test-Path $nextOut) {
        Write-Host "Removing $nextOut (-Clean) ..."
        Remove-Item -LiteralPath $nextOut -Recurse -Force
      }
    }
    $envLocal = Join-Path $repoRoot "web\.env.local"
    if (-not (Test-Path $envLocal)) {
      Write-Warning "Missing web\.env.local. Copy web\.env.local.example to web\.env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then run again."
    }
    Write-Host "Running npm install in ${webDir} ..."
    & npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $nextBin = Join-Path (Get-Location) "node_modules\next\dist\bin\next"
    if (-not (Test-Path $nextBin)) {
      Write-Error "next CLI not found at $nextBin - npm install may have failed."
      exit 1
    }

    $mode = if ($Lan) { 'LAN on 0.0.0.0:3000' } else { 'localhost only' }
    Write-Host "Starting Next.js ($mode). Leave this window open; press Ctrl+C to stop."
    if ($Lan) {
      & node $nextBin dev -H 0.0.0.0
    } else {
      & node $nextBin dev
    }
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if ($driveMapped) {
    Write-Host "Unmapping ${drive} (normal when you stop the server)."
    cmd /c "subst ${drive} /D >nul 2>&1"
  }
}
