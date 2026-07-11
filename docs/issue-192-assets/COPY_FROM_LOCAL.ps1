$ErrorActionPreference = 'Stop'

$sourceRoot = 'D:\AI\workspace\new\define-clone'
$targetRoot = Join-Path $PSScriptRoot '..\..\src\assets\define-color'
$targetRoot = [System.IO.Path]::GetFullPath($targetRoot)

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $targetRoot 'patterns') | Out-Null

Copy-Item -LiteralPath (Join-Path $sourceRoot 'color_theme_editor_dots_pattern.png') `
  -Destination (Join-Path $targetRoot 'editor-dots-pattern.png') -Force

Copy-Item -LiteralPath (Join-Path $sourceRoot 'color_theme_editor_transparent_pattern.png') `
  -Destination (Join-Path $targetRoot 'transparent-pattern.png') -Force

$officialPatterns = Join-Path $sourceRoot 'patterns'
if (Test-Path $officialPatterns) {
  Copy-Item -LiteralPath (Join-Path $officialPatterns '*.png') `
    -Destination (Join-Path $targetRoot 'patterns') -Force
  Write-Host 'Copied official Define pattern PNG files.'
} else {
  Write-Warning 'Official pattern folder not found. Use docs/issue-192-assets fallback SVG files.'
}

Write-Host "Define color assets copied to: $targetRoot"
