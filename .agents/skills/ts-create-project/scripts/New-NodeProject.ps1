<#
.SYNOPSIS
  Scaffold a new TypeScript/Node.js project (app, library, or CLI tool).

.PARAMETER ProjectName
  Name for the project (used as directory name and package name).

.PARAMETER ProjectType
  Project type: 'app' (general application), 'library' (publishable package), or 'cli' (CLI tool).

.PARAMETER PackageManager
  Package manager to use: 'npm' or 'pnpm'. Default: 'npm'.

.PARAMETER OutputDirectory
  Parent directory to create the project in. Default: current directory.
#>
param(
  [Parameter(Mandatory)][string]$ProjectName,
  [ValidateSet('app', 'library', 'cli')][string]$ProjectType = 'app',
  [ValidateSet('npm', 'pnpm')][string]$PackageManager = 'npm',
  [string]$OutputDirectory = '.'
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$TemplatesDir = Join-Path $ScriptDir '../templates'
$TargetDir = Join-Path $OutputDirectory $ProjectName

if (Test-Path $TargetDir) {
  Write-Error "Directory '$TargetDir' already exists."
}

Write-Host "Scaffolding Node.js project: $ProjectName ($ProjectType)" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $TargetDir 'src') | Out-Null

# Copy templates
$files = @('package.json', 'tsconfig.json', '.gitignore', 'vitest.config.ts')
foreach ($f in $files) {
  Copy-Item (Join-Path $TemplatesDir $f) (Join-Path $TargetDir $f)
}
Copy-Item (Join-Path $TemplatesDir 'src/index.ts') (Join-Path $TargetDir 'src/index.ts')

# Patch package name
$safeName = $ProjectName.ToLower() -replace '[^a-z0-9@/.-]', '-'
$pkgPath = Join-Path $TargetDir 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$pkg.name = $safeName

# Patch entry point / type-specific fields
switch ($ProjectType) {
  'library' {
    $pkg | Add-Member -NotePropertyName 'main' -NotePropertyValue './dist/index.js'
    $pkg | Add-Member -NotePropertyName 'types' -NotePropertyValue './dist/index.d.ts'
    $pkg | Add-Member -NotePropertyName 'exports' -NotePropertyValue ([ordered]@{
      '.' = [ordered]@{ import = './dist/index.js'; types = './dist/index.d.ts' }
    })
    $pkg | Add-Member -NotePropertyName 'files' -NotePropertyValue @('dist')
    # Replace dev entry point for library
    (Get-Content (Join-Path $TargetDir 'src/index.ts')) -replace 'main\(\);', '' |
      Set-Content (Join-Path $TargetDir 'src/index.ts')
    Write-Host "Library fields (exports, types, files) added to package.json" -ForegroundColor Green
  }
  'cli' {
    $pkg | Add-Member -NotePropertyName 'bin' -NotePropertyValue ([ordered]@{ $safeName = './dist/index.js' })
    # Add shebang to src/index.ts
    $content = Get-Content (Join-Path $TargetDir 'src/index.ts') -Raw
    "#!/usr/bin/env node`n$content" | Set-Content (Join-Path $TargetDir 'src/index.ts')
    Write-Host "CLI bin field added to package.json; shebang added to src/index.ts" -ForegroundColor Green
  }
}

# Patch project name in src/index.ts
(Get-Content (Join-Path $TargetDir 'src/index.ts')) -replace 'my-project', $ProjectName |
  Set-Content (Join-Path $TargetDir 'src/index.ts')

$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath

# Install dependencies
Push-Location $TargetDir
try {
  Write-Host "Installing dependencies with $PackageManager..." -ForegroundColor Cyan
  & $PackageManager install
  Write-Host "Initializing git repository..." -ForegroundColor Cyan
  git init -q
  Write-Host "Done! Run 'npm run dev' to start development." -ForegroundColor Green
  Write-Host "Next steps: set up code quality with 'setup-biome-husky', add CI with 'create-node-workflow'" -ForegroundColor DarkGray
} finally {
  Pop-Location
}
