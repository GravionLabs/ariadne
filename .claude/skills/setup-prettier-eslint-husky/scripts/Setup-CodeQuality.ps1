<#
.SYNOPSIS
  Installs ESLint, Prettier, Husky, and lint-staged for a TypeScript or Angular project.

.PARAMETER ProjectType
  Target project type: 'angular' or 'ts' (plain TypeScript).

.PARAMETER SelectorPrefix
  Angular component/directive selector prefix. Default: 'app'. Ignored for 'ts'.

.PARAMETER IDE
  IDE-specific config to generate: 'vscode', 'webstorm', 'both', or 'none'.
#>
param(
  [Parameter(Mandatory)][ValidateSet('angular', 'ts')][string]$ProjectType,
  [string]$SelectorPrefix = 'app',
  [ValidateSet('vscode', 'webstorm', 'both', 'none')][string]$IDE = 'vscode'
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$TemplatesDir = Join-Path $ScriptDir '../templates'

# Install packages
$packages = @(
  'eslint', 'prettier', 'prettier-plugin-organize-imports',
  'husky', 'lint-staged', 'eslint-config-prettier'
)
if ($ProjectType -eq 'angular') {
  $packages += @(
    '@typescript-eslint/eslint-plugin', '@typescript-eslint/parser',
    '@angular-eslint/eslint-plugin', '@angular-eslint/eslint-plugin-template',
    '@angular-eslint/template-parser'
  )
} else {
  $packages += @('@typescript-eslint/eslint-plugin', '@typescript-eslint/parser')
}
# Detect package manager: pnpm when a pnpm lockfile or packageManager field is present, else npm
$usePnpm = (Test-Path 'pnpm-lock.yaml') -or (
  (Test-Path 'package.json') -and
  ((Get-Content 'package.json' -Raw | ConvertFrom-Json).packageManager -like 'pnpm@*')
)
Write-Host "Installing packages with $($usePnpm ? 'pnpm' : 'npm')..." -ForegroundColor Cyan
if ($usePnpm) { pnpm add -D @packages } else { npm install --save-dev @packages }

# Copy template files
Write-Host "Copying config templates..." -ForegroundColor Cyan
Copy-Item (Join-Path $TemplatesDir '.prettierrc') '.prettierrc' -Force
Copy-Item (Join-Path $TemplatesDir '.prettierignore') '.prettierignore' -Force

$eslintSrc = Join-Path $TemplatesDir (
  $ProjectType -eq 'angular' ? 'angular/eslint.config.mjs' : 'plain-ts/eslint.config.mjs'
)
Copy-Item $eslintSrc 'eslint.config.mjs' -Force

# Update selector prefix for Angular
if ($ProjectType -eq 'angular' -and $SelectorPrefix -ne 'app') {
  (Get-Content 'eslint.config.mjs') -replace "'app'", "'$SelectorPrefix'" |
    Set-Content 'eslint.config.mjs'
  Write-Host "Selector prefix set to '$SelectorPrefix'" -ForegroundColor Green
}

# Init Husky
Write-Host "Initializing Husky..." -ForegroundColor Cyan
if (-not (Test-Path '.husky')) { npx husky init }
Copy-Item (Join-Path $TemplatesDir '.husky/pre-commit') '.husky/pre-commit' -Force

# Add lint-staged config to package.json
$pkgPath = 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if (-not $pkg.'lint-staged') {
  $ext = $ProjectType -eq 'angular' ? '{ts,html}' : 'ts'
  $pkg | Add-Member -NotePropertyName 'lint-staged' -NotePropertyValue ([ordered]@{
    "src/**/*.$ext" = @('eslint --fix', 'prettier --write')
    'src/**/*.scss' = @('prettier --write')
  })
  $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath
  Write-Host "lint-staged added to package.json" -ForegroundColor Green
}

# VSCode settings
if ($IDE -eq 'vscode' -or $IDE -eq 'both') {
  New-Item -ItemType Directory -Force '.vscode' | Out-Null
  [ordered]@{
    'editor.formatOnSave'          = $true
    'editor.defaultFormatter'      = 'esbenp.prettier-vscode'
    'eslint.useFlatConfig'         = $true
  } | ConvertTo-Json | Set-Content '.vscode/settings.json'
  Write-Host ".vscode/settings.json created" -ForegroundColor Green
}

Write-Host "Done! Run 'npx eslint .' and 'npx prettier --check .' to verify." -ForegroundColor Green
