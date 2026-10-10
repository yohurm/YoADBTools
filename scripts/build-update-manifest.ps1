# Build update-manifest.json for GitHub Releases (static check path, no REST API).
# Platform keys match yohu-update::github::manifest::platform_manifest_key.
# Multi-platform CI/Release prefers scripts/build-update-manifest.sh.
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $false)][string]$SetupPath = "",
    [string]$Owner = "yohurm",
    [string]$Repo = "Windows-YoADBTools",
    [string]$Tag = "",
    [string]$Notes = "",
    [string]$OutFile = "",
    # Optional extra platforms: @( @{ Key = "linux-x86_64"; Path = "..." }, ... )
    [hashtable[]]$Platforms = @()
)

$ErrorActionPreference = "Stop"
$allowed = @(
    "windows-x86_64",
    "darwin-aarch64",
    "darwin-x86_64",
    "linux-x86_64",
    "linux-aarch64"
)

$ver = $Version.TrimStart("v", "V")
if ([string]::IsNullOrWhiteSpace($Tag)) { $Tag = "v$ver" }

$entries = @()
if (-not [string]::IsNullOrWhiteSpace($SetupPath)) {
    $entries += @{ Key = "windows-x86_64"; Path = $SetupPath }
}
foreach ($p in $Platforms) {
    if (-not $p.ContainsKey("Key") -or -not $p.ContainsKey("Path")) {
        throw "Platforms 项需要 Key 与 Path"
    }
    $entries += $p
}
if ($entries.Count -eq 0) {
    throw "需要 -SetupPath 和/或 -Platforms"
}

$platformMap = [ordered]@{}
$firstPath = $null
foreach ($e in $entries) {
    $key = [string]$e.Key
    $path = [string]$e.Path
    if ($allowed -notcontains $key) { throw "非法平台键: $key" }
    if (-not (Test-Path $path)) { throw "Setup missing: $path" }
    $item = Get-Item $path
    if ($null -eq $firstPath) { $firstPath = $item }
    $name = $item.Name
    $url = "https://github.com/$Owner/$Repo/releases/download/$Tag/$name"
    $sha = ""
    try {
        $hash = Get-FileHash -Path $path -Algorithm SHA256
        $sha = $hash.Hash.ToLowerInvariant()
    } catch {
        Write-Host "    (sha256 skipped: $($_.Exception.Message))"
    }
    $platformMap[$key] = [ordered]@{
        url        = $url
        name       = $name
        size_bytes = [int64]$item.Length
        sha256     = $sha
    }
    Write-Host "  $key <- $name ($([math]::Round($item.Length/1MB,2)) MB)"
}

$page = "https://github.com/$Owner/$Repo/releases/tag/$Tag"
$manifest = [ordered]@{
    version   = $ver
    notes     = $Notes
    page_url  = $page
    platforms = $platformMap
}

if ([string]::IsNullOrWhiteSpace($OutFile)) {
    if ($null -eq $firstPath) { throw "无法推断 OutFile" }
    $OutFile = Join-Path $firstPath.DirectoryName "update-manifest.json"
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding utf8
Write-Host "Wrote $OutFile"
