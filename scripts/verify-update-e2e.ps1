# Release update E2E: install local setup -> live GitHub check+download -> optional UI overlay.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-update-e2e.ps1 [-InstallOverlay]
param(
    [switch]$InstallOverlay,
    [string]$Setup = (Join-Path $PSScriptRoot "..\target\release\bundle\nsis\YohuAdbTools_0.1.1_x64-setup.exe"),
    [string]$ExpectRemote = "0.1.2"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "verify-lib.ps1")

$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notmatch 'Git\\usr\\bin' }) -join ';'

if (-not (Test-Path $Setup)) {
    throw "Missing installer: $Setup (run tauri build for 0.1.1 first)"
}

if ([string]::IsNullOrWhiteSpace($ProductDataDir)) { $ProductDataDir = "YohuAdbTools" }
$dataRoot = Join-Path $env:LOCALAPPDATA $ProductDataDir
$configDir = Join-Path $dataRoot "config"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$token = gh auth token
@{ github = @{ token = $token } } | ConvertTo-Json | Set-Content -Path (Join-Path $configDir "update.json") -Encoding utf8

Get-Process YohuAdbTools -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$cacheDir = Join-Path $dataRoot "cache\update"
$instDir = Join-Path $env:LOCALAPPDATA "Programs\YohuAdbTools"
Write-Host "[0/4] Clean cached installers and prior install tree"
if (Test-Path $cacheDir) {
    Get-ChildItem $cacheDir -Force -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
}
if (Test-Path $instDir) {
    Remove-Item $instDir -Recurse -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

Write-Host "[1/4] Silent install: $Setup"
Start-Process -FilePath $Setup -ArgumentList "/S" -Wait
$inst = Join-Path $env:LOCALAPPDATA "Programs\YohuAdbTools\YohuAdbTools.exe"
if (-not (Test-Path $inst)) { throw "Installed exe missing: $inst" }
$ver = (Get-Item $inst).VersionInfo.ProductVersion
Write-Host "    ProductVersion=$ver"

if (-not $InstallOverlay) {
    Write-Host "[2/4] Live GitHub check + download (yohu-update ignored test)"
    $env:YOHU_GITHUB_TOKEN = $token
    Set-Location $repoRoot
    cargo test -p yohu-update --release live_check_and_download_from_github -- --ignored --nocapture
    if ($LASTEXITCODE -ne 0) { throw "live GitHub download failed" }

    Write-Host "[3/4] Verify cached installer (core live test)"
    $artifact = Get-ChildItem $cacheDir -Filter "*${ExpectRemote}*setup.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $artifact) { throw "No *${ExpectRemote}*setup.exe under $cacheDir" }
    $mb = [math]::Round($artifact.Length / 1MB, 2)
    Write-Host "    $($artifact.FullName) (${mb} MB)"
    Write-Host "[4/4] Skip UI overlay (add -InstallOverlay for full NSIS overlay test)"
    Write-Host "    Manual: start $inst -> Settings -> check update -> download -> install"
} else {
    Write-Host "[2/4] Skip core live test (-InstallOverlay uses UI path only)"
    Write-Host "[3/4] Skip pre-UI cache check"
    Write-Host "[4/4] UI check/download/install to $ExpectRemote (cache cleared for UI download)"
    Get-ChildItem $cacheDir -Filter "*setup.exe" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem $cacheDir -Filter "*.part" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    & (Join-Path $PSScriptRoot "verify-update-ui.ps1") -Install
    Start-Sleep -Seconds 3
    Get-Process YohuAdbTools -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    $verAfter = (Get-Item $inst).VersionInfo.ProductVersion
    Write-Host "    ProductVersion after overlay=$verAfter"
    if ($verAfter -ne $ExpectRemote) { throw "Expected ProductVersion $ExpectRemote after overlay, got $verAfter" }
    Write-Host ""
    Write-Host "Update E2E UI overlay OK ($ver -> $verAfter)"
    exit 0
}

Write-Host ""
Write-Host "Update E2E core path OK (installed $ver, remote $ExpectRemote in cache)"
