<#
.SYNOPSIS
  Scaffold a new TypeScript MCP server project from the starter templates.

.PARAMETER ServerName
  Name for the MCP server (used as directory name and package name).

.PARAMETER OutputDirectory
  Parent directory to create the server in. Default: current directory.
#>
param(
  [Parameter(Mandatory)][string]$ServerName,
  [string]$OutputDirectory = '.'
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$TemplatesDir = Join-Path $ScriptDir '../templates'
$TargetDir = Join-Path $OutputDirectory $ServerName

if (Test-Path $TargetDir) {
  Write-Error "Directory '$TargetDir' already exists. Choose a different name or remove it first."
}

Write-Host "Creating MCP server: $ServerName" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $TargetDir 'src') | Out-Null

# Copy templates
Copy-Item (Join-Path $TemplatesDir 'package.json') (Join-Path $TargetDir 'package.json')
Copy-Item (Join-Path $TemplatesDir 'tsconfig.json') (Join-Path $TargetDir 'tsconfig.json')
Copy-Item (Join-Path $TemplatesDir 'src/index.ts') (Join-Path $TargetDir 'src/index.ts')

# Patch server name
$safeName = $ServerName.ToLower() -replace '[^a-z0-9-]', '-'
(Get-Content (Join-Path $TargetDir 'package.json')) -replace '"my-mcp-server"', "`"$safeName`"" |
  Set-Content (Join-Path $TargetDir 'package.json')
(Get-Content (Join-Path $TargetDir 'src/index.ts')) -replace 'my-mcp-server', $ServerName |
  Set-Content (Join-Path $TargetDir 'src/index.ts')

# Install dependencies
Push-Location $TargetDir
try {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  npm install
  Write-Host "Done! Run 'npm run dev' to start." -ForegroundColor Green
} finally {
  Pop-Location
}
