<#
.SYNOPSIS
  Installs Biome, Husky and lint-staged for a plain TypeScript project.

.PARAMETER IDE
  IDE-specific config to generate: 'vscode', 'webstorm', 'both', or 'none'.
#>
param(
  [ValidateSet('vscode', 'webstorm', 'both', 'none')][string]$IDE = 'vscode'
)

$ErrorActionPreference = 'Stop'
$TemplatesDir = Join-Path $PSScriptRoot '../templates'

if (Test-Path 'angular.json') {
  throw 'Angular project: use setup-prettier-eslint-husky (Biome has no Angular template support).'
}

$packages = @('@biomejs/biome', 'husky', 'lint-staged')
# Detect package manager: pnpm when a pnpm lockfile or packageManager field is present, else npm
$usePnpm = (Test-Path 'pnpm-lock.yaml') -or (
  (Test-Path 'package.json') -and
  ((Get-Content 'package.json' -Raw | ConvertFrom-Json).packageManager -like 'pnpm@*')
)
Write-Host "Installing packages with $($usePnpm ? 'pnpm' : 'npm')..." -ForegroundColor Cyan
if ($usePnpm) { pnpm add -D @packages } else { npm install --save-dev @packages }

if ((Test-Path 'biome.json') -or (Test-Path 'biome.jsonc')) {
  Write-Host 'biome.json exists, kept.' -ForegroundColor Yellow
  Write-Host 'Markdown and YAML need Biome >= 2.6. For Markdown add to biome.json: "markdown": { "parser": { "frontmatter": true }, "formatter": { "proseWrap": "preserve" } }' -ForegroundColor Yellow
} else {
  Copy-Item (Join-Path $TemplatesDir 'biome.json.template') 'biome.json'
}

Write-Host 'Initializing Husky...' -ForegroundColor Cyan
if (-not (Test-Path '.husky')) { npx husky init }
Copy-Item (Join-Path $TemplatesDir '.husky/pre-commit') '.husky/pre-commit' -Force

$pkgPath = 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json -AsHashtable
if (-not $pkg.ContainsKey('lint-staged')) {
  $pkg['lint-staged'] = [ordered]@{ '*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml}' = @('biome check --write --no-errors-on-unmatched') }
}
if (-not $pkg.ContainsKey('scripts')) { $pkg['scripts'] = [ordered]@{} }
$scripts = [ordered]@{ 'format' = 'biome format --write .'; 'format:check' = 'biome check .'; 'lint' = 'biome lint .' }
foreach ($s in $scripts.GetEnumerator()) {
  if (-not $pkg['scripts'].ContainsKey($s.Key)) { $pkg['scripts'][$s.Key] = $s.Value }
}
$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath
Write-Host 'lint-staged and scripts added to package.json' -ForegroundColor Green

if ($IDE -eq 'vscode' -or $IDE -eq 'both') {
  New-Item -ItemType Directory -Force '.vscode' | Out-Null
  [ordered]@{
    'editor.formatOnSave'     = $true
    'editor.defaultFormatter' = 'biomejs.biome'
  } | ConvertTo-Json | Set-Content '.vscode/settings.json'
  Write-Host '.vscode/settings.json created' -ForegroundColor Green
}
if ($IDE -eq 'webstorm' -or $IDE -eq 'both') {
  Write-Host 'WebStorm: enable Biome under Settings > Languages & Frameworks > JavaScript > Code Quality Tools > Biome, with "Run on save".' -ForegroundColor Cyan
}

Write-Host "Done! Run 'npx biome check --write .' once, then 'npx biome check .' to verify." -ForegroundColor Green
