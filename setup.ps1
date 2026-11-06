# One-step setup: install, test, build, then print the Figma import steps.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is required. Install it from https://nodejs.org and run this again.' -ForegroundColor Red
  exit 1
}

npm install
npm test
npm run build

$manifest = Join-Path $PSScriptRoot 'manifest.json'
Set-Clipboard -Value $manifest

Write-Host ''
Write-Host 'Build done. The manifest path is copied to your clipboard:' -ForegroundColor Green
Write-Host "  $manifest"
Write-Host ''
Write-Host 'In Figma desktop:'
Write-Host '  1. Plugins > Development > Import widget from manifest... (paste the path)'
Write-Host '  2. Shift+I > Widgets > Development > Annotation'
Write-Host ''
Write-Host 'If Figma rejects the manifest id: Plugins > Development > New plugin > Widget,'
Write-Host 'copy the "id" from that manifest.json into this one, then import again.'
