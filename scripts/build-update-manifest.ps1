# Build update-manifest.json for GitHub Releases (static check path, no REST API).
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$SetupPath,
    [string]$Owner = "yohurm",
    [string]$Repo = "Windows-YoADBTools",
    [string]$Tag = "",
    [string]$Notes = "",
    [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $SetupPath)) { throw "Setup missing: $SetupPath" }
$ver = $Version.TrimStart("v", "V")
if ([string]::IsNullOrWhiteSpace($Tag)) { $Tag = "v$ver" }
$setup = Get-Item $SetupPath
$name = $setup.Name
$url = "https://github.com/$Owner/$Repo/releases/download/$Tag/$name"
$page = "https://github.com/$Owner/$Repo/releases/tag/$Tag"
$sha = ""
try {
    $hash = Get-FileHash -Path $SetupPath -Algorithm SHA256
    $sha = $hash.Hash.ToLowerInvariant()
} catch {
    Write-Host "    (sha256 skipped: $($_.Exception.Message))"
}

$manifest = [ordered]@{
    version  = $ver
    notes    = $Notes
    page_url = $page
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            url         = $url
            name        = $name
            size_bytes  = [int64]$setup.Length
            sha256      = $sha
        }
    }
}

if ([string]::IsNullOrWhiteSpace($OutFile)) {
    $OutFile = Join-Path $setup.DirectoryName "update-manifest.json"
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding utf8
Write-Host "Wrote $OutFile ($([math]::Round($setup.Length/1MB,2)) MB, sha256=$sha)"
