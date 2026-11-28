<#
.SYNOPSIS
  Installs oxlint, oxfmt, Husky and lint-staged for a plain TypeScript, Node or Angular project (ADR 0006).

.PARAMETER ProjectType
  'auto' (default: angular when angular.json exists), 'ts' or 'angular'.

.PARAMETER SelectorPrefix
  Angular component/directive selector prefix. Default: 'app'. Ignored for 'ts'.

.PARAMETER IDE
  IDE-specific config to generate: 'vscode', 'webstorm', 'both', or 'none'.

.PARAMETER Stylelint
  Add Stylelint for CSS and SCSS (ADR 0008). Always on for Angular; optional for 'ts'.

.PARAMETER WhatIf
  Prints the plan (packages, files, scripts) as JSON and changes nothing.
#>
param(
  [ValidateSet('auto', 'ts', 'angular')][string]$ProjectType = 'auto',
  [ValidatePattern('^[a-z][a-z0-9-]*$')][string]$SelectorPrefix = 'app',
  [ValidateSet('vscode', 'webstorm', 'both', 'none')][string]$IDE = 'vscode',
  [switch]$Stylelint,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$TemplatesDir = Join-Path $PSScriptRoot '../templates'

# templates carry a .template suffix: a nested .oxlintrc.json / .oxfmtrc.json would be picked up by oxc in this repository
# exact versions: JS plugins are alpha (ADR 0006); raise them together, each older than the release-age delay
$Versions = [ordered]@{ 'oxlint' = '1.93.0'; 'oxfmt' = '0.78.0'; 'oxlint-tsgolint' = '7.0.2007' }

if (-not (Test-Path 'package.json')) { throw 'No package.json in the current directory: run from the project root.' }
$angular = if ($ProjectType -eq 'auto') { Test-Path 'angular.json' } else { $ProjectType -eq 'angular' }
$stylelintOn = $angular -or $Stylelint
$variant = if ($angular) { 'angular' } else { 'plain-ts' }

$packages = @($Versions.GetEnumerator() | ForEach-Object { "$($_.Key)@$($_.Value)" }) + @('husky', 'lint-staged')
if ($angular) { $packages += @('eslint', 'angular-eslint', 'typescript-eslint', '@angular-eslint/eslint-plugin') }

if ($stylelintOn) { $packages += @('stylelint', 'stylelint-config-standard-scss') }

$files = [ordered]@{
  '.oxfmtrc.json'  = Join-Path $TemplatesDir '.oxfmtrc.json.template'
  '.oxlintrc.json' = Join-Path $TemplatesDir "$variant/.oxlintrc.json.template"
}
if ($angular) {
  $files['eslint.config.mjs'] = Join-Path $TemplatesDir 'angular/eslint.config.mjs'
  foreach ($f in 'probe.ts', 'probe.html', 'check.mjs') { $files["lint-probe/$f"] = Join-Path $TemplatesDir "angular/lint-probe/$f" }
}

if ($stylelintOn) { $files['stylelint.config.mjs'] = Join-Path $TemplatesDir 'stylelint.config.mjs' }

$code = '*.{ts,tsx,js,mjs,cjs}'
$data = if ($stylelintOn) { '*.{json,md,yml,yaml}' } else { '*.{json,md,yml,yaml,css}' }
$fmt = 'oxfmt --no-error-on-unmatched-pattern'
$lintStaged = [ordered]@{ $code = @('oxlint --fix --no-error-on-unmatched-pattern', $fmt); $data = @($fmt) }
if ($stylelintOn) { $lintStaged['*.{css,scss}'] = @('stylelint --fix --allow-empty-input', $fmt) }
if ($angular) { $lintStaged['*.html'] = @('eslint --fix --no-error-on-unmatched-pattern', $fmt) }

$lint = if ($angular) { 'oxlint && eslint --no-error-on-unmatched-pattern "**/*.html" && node lint-probe/check.mjs' } else { 'oxlint' }
$stylesCmd = 'stylelint --allow-empty-input "**/*.{css,scss}"'
if ($stylelintOn) { $lint += " && $stylesCmd" }
$scripts = [ordered]@{ 'lint' = $lint; 'lint:fix' = 'oxlint --fix'; 'format' = 'oxfmt'; 'format:check' = 'oxfmt --check' }
if ($stylelintOn) { $scripts['lint:styles'] = $stylesCmd }

$previous = @(
  @('biome.json', 'biome.jsonc') | Where-Object { Test-Path $_ }
  @(Get-ChildItem -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '.prettierrc*' -or $_.Name -like 'prettier.config.*' } | ForEach-Object Name)
)

if ($WhatIf) {
  [ordered]@{
    variant  = $variant
    packages = $packages
    files    = @($files.Keys | ForEach-Object { [ordered]@{ path = $_; action = $(if (Test-Path $_) { 'keep' } else { 'create' }) } })
    scripts  = $scripts
    lintStaged = $lintStaged
    previous = $previous
  } | ConvertTo-Json -Depth 5
  exit 0
}

# Detect package manager: pnpm when a pnpm lockfile or packageManager field is present, else npm
$usePnpm = (Test-Path 'pnpm-lock.yaml') -or ((Get-Content 'package.json' -Raw | ConvertFrom-Json).packageManager -like 'pnpm@*')
Write-Host "Installing packages with $($usePnpm ? 'pnpm' : 'npm')..." -ForegroundColor Cyan
if ($usePnpm) { pnpm add -D --save-exact @packages } else { npm install --save-dev --save-exact @packages }
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }

foreach ($f in $files.GetEnumerator()) {
  if (Test-Path $f.Key) { Write-Host "$($f.Key) exists, kept." -ForegroundColor Yellow; continue }
  $dir = Split-Path $f.Key -Parent
  if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
  Copy-Item $f.Value $f.Key
  Write-Host "$($f.Key) created" -ForegroundColor Green
}
if ($angular) {
  # Angular templates format with the Angular parser
  $cfg = Get-Content '.oxfmtrc.json' -Raw | ConvertFrom-Json -AsHashtable
  if (-not $cfg.ContainsKey('associations')) {
    $cfg['associations'] = @([ordered]@{ files = @('src/**/*.html'); language = 'angular-html' })
    $cfg | ConvertTo-Json -Depth 10 | Set-Content '.oxfmtrc.json'
  }
  if ($SelectorPrefix -ne 'app') {
    (Get-Content '.oxlintrc.json' -Raw) -replace '"prefix": "app"', "`"prefix`": `"$SelectorPrefix`"" | Set-Content '.oxlintrc.json'
    Write-Host "Selector prefix set to '$SelectorPrefix'" -ForegroundColor Green
  }
}

Write-Host 'Initializing Husky...' -ForegroundColor Cyan
if (-not (Test-Path '.husky')) { npx husky init }
Copy-Item (Join-Path $TemplatesDir '.husky/pre-commit') '.husky/pre-commit' -Force

$pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json -AsHashtable
if (-not $pkg.ContainsKey('lint-staged')) { $pkg['lint-staged'] = $lintStaged }
else { Write-Host 'lint-staged exists, kept: compare it with the plan of -WhatIf.' -ForegroundColor Yellow }
if (-not $pkg.ContainsKey('scripts')) { $pkg['scripts'] = [ordered]@{} }
foreach ($s in $scripts.GetEnumerator()) {
  if (-not $pkg['scripts'].ContainsKey($s.Key)) { $pkg['scripts'][$s.Key] = $s.Value }
  elseif ($pkg['scripts'][$s.Key] -ne $s.Value) { Write-Host "script '$($s.Key)' exists, kept (oxc: $($s.Value))" -ForegroundColor Yellow }
}
$pkg | ConvertTo-Json -Depth 10 | Set-Content 'package.json'
Write-Host 'lint-staged and scripts added to package.json' -ForegroundColor Green

if ($IDE -eq 'vscode' -or $IDE -eq 'both') {
  New-Item -ItemType Directory -Force '.vscode' | Out-Null
  $settings = [ordered]@{ 'editor.formatOnSave' = $true; 'editor.defaultFormatter' = 'oxc.oxc-vscode' }
  if ($angular) { $settings['eslint.validate'] = @('html') }
  $settings | ConvertTo-Json | Set-Content '.vscode/settings.json'
  $recommend = @('oxc.oxc-vscode') + $(if ($angular) { @('dbaeumer.vscode-eslint', 'angular.ng-template') } else { @() })
  [ordered]@{ recommendations = $recommend } | ConvertTo-Json | Set-Content '.vscode/extensions.json'
  Write-Host '.vscode/settings.json and extensions.json written' -ForegroundColor Green
}
if ($IDE -eq 'webstorm' -or $IDE -eq 'both') {
  Write-Host 'WebStorm: install the Oxc plugin, enable oxlint and oxfmt with "Run on save"; for Angular enable ESLint for *.html.' -ForegroundColor Cyan
}

if ($previous.Count) {
  Write-Host "Previous tools found: $($previous -join ', '). Remove them and their packages in the same change; never run two formatters on the same files." -ForegroundColor Yellow
}
$runner = if ($usePnpm) { 'pnpm' } else { 'npm run' }
Write-Host "Done! Run 'npx oxfmt' once (commit it alone, add it to .git-blame-ignore-revs), then '$runner lint' and '$runner format:check'." -ForegroundColor Green
