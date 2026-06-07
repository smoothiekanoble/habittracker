$ErrorActionPreference = "Stop"

$RepoRoot = "C:\dev\personal\habittracker"
$ActiveStart = [TimeSpan]::Parse("10:00")
$ActiveEnd = [TimeSpan]::Parse("23:59")
$LogRetentionDays = 7
$LockStaleMinutes = 45

$LocalDataDir = Join-Path $RepoRoot "local-data"
$LogDir = Join-Path $LocalDataDir "logs"
$LockFile = Join-Path $LocalDataDir "codex-usage-import.lock"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$StdoutLog = Join-Path $LogDir "codex-usage-import-$Timestamp.out.log"
$StderrLog = Join-Path $LogDir "codex-usage-import-$Timestamp.err.log"
$lockAcquired = $false
$exitCode = 0

New-Item -ItemType Directory -Force -Path $LocalDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location -LiteralPath $RepoRoot

function Write-StdoutLog {
  param([string]$Message)
  Add-Content -LiteralPath $StdoutLog -Value $Message -Encoding utf8
}

function Write-StderrLog {
  param([string]$Message)
  Add-Content -LiteralPath $StderrLog -Value $Message -Encoding utf8
}

function Test-InActiveHours {
  param(
    [TimeSpan]$Now,
    [TimeSpan]$Start,
    [TimeSpan]$End
  )

  $endExclusive = $End.Add([TimeSpan]::FromMinutes(1))
  if ($endExclusive.TotalDays -ge 1) {
    $endExclusive = [TimeSpan]::FromDays(1)
  }

  if ($Start -le $End) {
    return $Now -ge $Start -and $Now -lt $endExclusive
  }

  return $Now -ge $Start -or $Now -lt $endExclusive
}

function Remove-OldLogs {
  $cutoff = (Get-Date).AddDays(-$LogRetentionDays)
  Get-ChildItem -LiteralPath $LogDir -File -Filter "codex-usage-import-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

function Test-LockIsRecent {
  if (!(Test-Path -LiteralPath $LockFile)) {
    return $false
  }

  $lockAgeMinutes = $null
  try {
    $lock = Get-Content -Raw -LiteralPath $LockFile | ConvertFrom-Json
    if ($lock.createdAt) {
      $lockAgeMinutes = ((Get-Date) - ([DateTime]::Parse($lock.createdAt))).TotalMinutes
    }
  } catch {
    $lockAgeMinutes = ((Get-Date) - (Get-Item -LiteralPath $LockFile).LastWriteTime).TotalMinutes
  }

  if ($null -eq $lockAgeMinutes) {
    $lockAgeMinutes = ((Get-Date) - (Get-Item -LiteralPath $LockFile).LastWriteTime).TotalMinutes
  }

  if ($lockAgeMinutes -lt $LockStaleMinutes) {
    return $true
  }

  Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
  return $false
}

function New-LockFile {
  $lock = [ordered]@{
    pid = $PID
    createdAt = (Get-Date -Format o)
    stdoutLog = $StdoutLog
    stderrLog = $StderrLog
  }
  $lock | ConvertTo-Json | Set-Content -LiteralPath $LockFile -Encoding utf8
}

try {
  Remove-OldLogs

  $now = Get-Date
  Write-StdoutLog "[$($now.ToString("o"))] Starting Codex usage import wrapper from $RepoRoot"

  if (!(Test-InActiveHours -Now $now.TimeOfDay -Start $ActiveStart -End $ActiveEnd)) {
    Write-StdoutLog "[$((Get-Date).ToString("o"))] Skipping Codex usage import outside active hours ($ActiveStart through $ActiveEnd)."
    exit 0
  }

  if (Test-LockIsRecent) {
    Write-StdoutLog "[$((Get-Date).ToString("o"))] Skipping Codex usage import because a recent lock exists: $LockFile"
    exit 0
  }

  New-LockFile
  $lockAcquired = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo.FileName = "node"
  $process.StartInfo.Arguments = "scripts/import-codex-usage.mjs"
  $process.StartInfo.WorkingDirectory = $RepoRoot
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  $process.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $process.StartInfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8

  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if ($stdout) {
    Write-StdoutLog $stdout.TrimEnd()
  }
  if ($stderr) {
    Write-StderrLog $stderr.TrimEnd()
  }

  $exitCode = $process.ExitCode
} catch {
  Write-StderrLog "[$((Get-Date).ToString("o"))] Wrapper failed: $($_.Exception.Message)"
  $exitCode = 1
} finally {
  if ($lockAcquired) {
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
  }

  Write-StdoutLog "[$((Get-Date).ToString("o"))] Finished Codex usage import wrapper with exit code $exitCode"
}

exit $exitCode
