<#
.SYNOPSIS
  Checks that a pnpm repository sets minimumReleaseAge (at least 4320 minutes) in pnpm-workspace.yaml.
.DESCRIPTION
  A repository with pnpm-lock.yaml is a pnpm repository; one without is skipped (skipped: true, ok: null).
  Prints JSON {repo, hasLockfile, minimumReleaseAge, ok}. Exit 1 when a pnpm repository lacks the key or sets less than 4320.
  -Root <dir> checks every child directory that is a git repository and prints an array with one result each; exit 1 when any is not ok.
  Without -Root the repository is -Repo (default: the git toplevel of the current directory).
.PARAMETER Repo
  Repository directory. Default: git toplevel.
.PARAMETER Root
  Directory whose child git repositories are all checked.
#>
[CmdletBinding()]
param(
  [string]$Repo,
  [string]$Root
)

$ErrorActionPreference = 'Stop'
$minimum = 4320

function Test-Repo([string]$Path) {
  $full = (Resolve-Path -LiteralPath $Path).Path
  $hasLock = Test-Path -LiteralPath (Join-Path $full 'pnpm-lock.yaml')
  $age = $null
  if ($hasLock) {
    $ws = Join-Path $full 'pnpm-workspace.yaml'
    if (Test-Path -LiteralPath $ws) {
      foreach ($line in Get-Content -LiteralPath $ws) {
        if ($line -match '^minimumReleaseAge\s*:\s*[''"]?(\d+)[''"]?\s*(#.*)?$') { $age = [int]$Matches[1]; break }
      }
    }
  }
  $ok = if ($hasLock) { $null -ne $age -and $age -ge $minimum } else { $null }
  [ordered]@{
    repo              = $full
    hasLockfile       = $hasLock
    minimumReleaseAge = $age
    ok                = $ok
    skipped           = -not $hasLock
  }
}

if ($Root) {
  $results = @(Get-ChildItem -LiteralPath $Root -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName '.git') } | Sort-Object Name | ForEach-Object { Test-Repo $_.FullName })
  ConvertTo-Json -InputObject $results -Depth 3
  if (@($results | Where-Object { $_.ok -eq $false }).Count -gt 0) { exit 1 }
  exit 0
}

if (-not $Repo) {
  $Repo = (git rev-parse --show-toplevel).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Not in a git repository; pass -Repo or -Root.' }
}
$result = Test-Repo $Repo
$result | ConvertTo-Json -Depth 3
if ($result.ok -eq $false) { exit 1 }
