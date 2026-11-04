<#
.SYNOPSIS
  Scaffold a new Angular 21+ application using the Angular CLI with strict TypeScript, Vitest, and ESLint/Prettier.

.PARAMETER ProjectName
  Name for the Angular project (directory and package name).

.PARAMETER SelectorPrefix
  Component and directive selector prefix. Default: 'app'.

.PARAMETER ProjectType
  Project type: 'app' (standard application) or 'workspace' (multi-project workspace).

.PARAMETER SkipVitest
  Do not set up Vitest (Vitest with the template config is installed by default).

.PARAMETER SkipEslint
  Do not set up ESLint + Prettier + Husky via Setup-CodeQuality.ps1 (set up by default).

.PARAMETER OutputDirectory
  Directory in which the project folder is created. Default: current directory.
#>
param(
  [Parameter(Mandatory)][string]$ProjectName,
  [string]$SelectorPrefix = 'app',
  [ValidateSet('app', 'workspace')][string]$ProjectType = 'app',
  [switch]$SkipVitest,
  [switch]$SkipEslint,
  [string]$OutputDirectory = '.'
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$TemplatesDir = Join-Path $ScriptDir '../templates'

# Check ng CLI is available
if (-not (Get-Command ng -ErrorAction SilentlyContinue)) {
  Write-Error "Angular CLI not found. Install it with: npm install -g @angular/cli"
}

Write-Host "Scaffolding Angular project: $ProjectName" -ForegroundColor Cyan

# Run ng new
$ngArgs = @(
  'new', $ProjectName,
  '--style', 'scss',
  '--ssr', 'false',
  '--skip-tests'  # we'll set up Vitest separately
)
if ($SelectorPrefix -ne 'app') { $ngArgs += @('--prefix', $SelectorPrefix) }

Push-Location $OutputDirectory
try {
  ng @ngArgs
} finally {
  Pop-Location
}

$TargetDir = Join-Path $OutputDirectory $ProjectName
Push-Location $TargetDir
try {
  # Replace tsconfig.json with strict settings
  Write-Host "Applying strict TypeScript configuration..." -ForegroundColor Cyan
  Copy-Item (Join-Path $TemplatesDir 'tsconfig.json') 'tsconfig.json' -Force

  # Set up Vitest
  if (-not $SkipVitest) {
    Write-Host "Setting up Vitest..." -ForegroundColor Cyan
    npm install --save-dev vitest jsdom

    Copy-Item (Join-Path $TemplatesDir 'vitest.config.ts') 'vitest.config.ts' -Force
    Copy-Item (Join-Path $TemplatesDir 'vitest.setup.ts') 'vitest.setup.ts' -Force

    # Patch package.json test script
    $pkgPath = 'package.json'
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $pkg.scripts.test = 'vitest run'
    $pkg.scripts | Add-Member -NotePropertyName 'test:watch' -NotePropertyValue 'vitest' -Force
    $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath
    Write-Host "Vitest configured (test script updated)" -ForegroundColor Green
  }

  # Set up ESLint + Prettier + Husky
  if (-not $SkipEslint) {
    Write-Host "Setting up ESLint + Prettier + Husky..." -ForegroundColor Cyan
    # installed: a sibling skill (skills-install ng brings it along); in GravionLabs/skills: skills/ts/
    $candidates = @(
      (Join-Path $ScriptDir '../../setup-prettier-eslint-husky/scripts/Setup-CodeQuality.ps1'),
      (Join-Path $ScriptDir '../../../ts/setup-prettier-eslint-husky/scripts/Setup-CodeQuality.ps1')
    )
    $setupScript = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($setupScript) {
      & pwsh $setupScript -ProjectType angular -SelectorPrefix $SelectorPrefix
    } else {
      Write-Warning "Setup-CodeQuality.ps1 not found at '$setupScript' — run the setup-prettier-eslint-husky skill manually."
    }
  }

  Write-Host "`nDone! Next steps:" -ForegroundColor Green
  Write-Host "  ng serve         — start dev server at http://localhost:4200" -ForegroundColor DarkGray
  Write-Host "  ng build         — production build" -ForegroundColor DarkGray
  Write-Host "  npm test         — run unit tests with Vitest" -ForegroundColor DarkGray
} finally {
  Pop-Location
}
