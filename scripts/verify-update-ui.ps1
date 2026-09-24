# Release UI: settings -> check update -> download -> optional install; tail app.log / apply.log.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-update-ui.ps1 [-Install]
param(
    [switch]$Install,
    [string]$Exe = (Join-Path $env:LOCALAPPDATA "Programs\YohuAdbTools\YohuAdbTools.exe"),
    [int]$StartupWaitSec = 12
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "verify-lib.ps1")
if ([string]::IsNullOrWhiteSpace($ProductDataDir)) { $ProductDataDir = "YohuAdbTools" }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-LogTailMarker([string]$Path) {
    if (-not (Test-Path $Path)) { return 0 }
    return (Get-Item $Path).Length
}

function Show-LogDelta([string]$Path, [long]$From, [string]$Label) {
    if (-not (Test-Path $Path)) {
        Write-Host "[$Label] (no file yet) $Path"
        return
    }
    $len = (Get-Item $Path).Length
    if ($len -le $From) {
        Write-Host "[$Label] (no new lines)"
        return
    }
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $null = $fs.Seek($From, [System.IO.SeekOrigin]::Begin)
        $reader = New-Object System.IO.StreamReader($fs)
        $text = $reader.ReadToEnd()
        Write-Host "----- $Label (new) -----"
        Write-Host $text
        Write-Host "----- end $Label -----"
    } finally {
        $fs.Dispose()
    }
}

function Find-Descendant($Root, [scriptblock]$Pred, [int]$Depth = 0, [int]$MaxDepth = 25) {
    if ($null -eq $Root -or $Depth -gt $MaxDepth) { return $null }
    if (& $Pred $Root) { return $Root }
    $children = $Root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($c in $children) {
        $hit = Find-Descendant $c $Pred ($Depth + 1) $MaxDepth
        if ($hit) { return $hit }
    }
    return $null
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
  public const int MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const int MOUSEEVENTF_LEFTUP = 0x0004;
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
  }
}
"@

function Invoke-UiClick($Element) {
    if ($null -eq $Element) { throw "UI element missing" }
    try {
        $pattern = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        if ($pattern) {
            $pattern.Invoke()
            return
        }
    } catch {}
    try {
        $toggle = $Element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
        if ($toggle) {
            $toggle.Toggle()
            return
        }
    } catch {}
    try {
        $sel = $Element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if ($sel) {
            $sel.Select()
            return
        }
    } catch {}
    $rect = $Element.Current.BoundingRectangle
    if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
        $x = [int]($rect.X + $rect.Width / 2)
        $y = [int]($rect.Y + $rect.Height / 2)
        [WinMouse]::Click($x, $y)
        return
    }
    throw "Element not clickable: $($Element.Current.Name)"
}

function Wait-Window([string]$TitlePart, [int]$TimeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty,
            $TitlePart
        )
        $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
        if ($win) { return $win }
        Start-Sleep -Milliseconds 500
    }
    throw "Window not found: $TitlePart"
}

function Click-ByName($Root, [string]$Name, [int]$Retries = 20) {
    for ($i = 0; $i -lt $Retries; $i++) {
        $el = Find-Descendant $Root { param($n) $n.Current.Name -eq $Name }
        if ($el) {
            Invoke-UiClick $el
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "UI name not found: $Name"
}

function Wait-LogContains([string]$Path, [long]$FromOffset, [string[]]$Needles, [int]$TimeoutSec = 120) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $Path) {
            $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
                $null = $fs.Seek($FromOffset, [System.IO.SeekOrigin]::Begin)
                $reader = New-Object System.IO.StreamReader($fs)
                $tail = $reader.ReadToEnd()
                foreach ($n in $Needles) {
                    if ($tail.Contains($n)) { return $n }
                }
            } finally {
                $fs.Dispose()
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Log wait timeout ($TimeoutSec s): expected one of [$($Needles -join ', ')]"
}

if (-not (Test-Path $Exe)) { throw "Release exe missing: $Exe" }

$configDir = Join-Path $env:LOCALAPPDATA "$ProductDataDir\config"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
try {
    $ghToken = gh auth token 2>$null
    if ($ghToken) {
        @{ github = @{ token = $ghToken.Trim() } } | ConvertTo-Json | Set-Content -Path (Join-Path $configDir "update.json") -Encoding utf8
    }
} catch {
    Write-Host "    (no gh token for update.json: $($_.Exception.Message))"
}

Get-Process YohuAdbTools -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

$logsDir = Join-Path $env:LOCALAPPDATA "$ProductDataDir\logs"
$appLog = Join-Path $logsDir ("app.{0:yyyy-MM-dd}.log" -f (Get-Date))
$applyLog = Join-Path $env:LOCALAPPDATA "$ProductDataDir\cache\update\apply.log"
$appMark = Get-LogTailMarker $appLog

Write-Host "[1] Launch Release: $Exe"
$p = Start-Process -FilePath $Exe -PassThru
Write-Host "    pid=$($p.Id)"
Start-Sleep -Seconds $StartupWaitSec
if ($p.HasExited) { throw "App exited early code=$($p.ExitCode)" }

Write-Host "[2] UI: settings -> check update"
$win = Wait-Window "Yohu ADB Tools"
try { $win.SetFocus() } catch {}
Start-Sleep -Milliseconds 800
$navSettings = [string]::new(@([char]0x8BBE, [char]0x7F6E))
$btnCheck = [string]::new(@([char]0x68C0, [char]0x67E5, [char]0x66F4, [char]0x65B0))
Click-ByName $win $navSettings
Start-Sleep -Seconds 2
Click-ByName $win $btnCheck
$logNewVersion = [string]::new(@([char]0x68C0, [char]0x67E5, [char]0x5230, [char]0x65B0, [char]0x7248, [char]0x672C))
$logUpToDate = [string]::new(@([char]0x5DF2, [char]0x662F, [char]0x6700, [char]0x65B0, [char]0x7248, [char]0x672C))
try {
    $checkHit = Wait-LogContains $appLog $appMark @($logNewVersion, $logUpToDate, "has_installer=") 120
} catch {
    $hint = "check did not finish in app.log (network/GitHub unavailable, or installed build lacks new Atom/manifest provider)"
    throw "$($_.Exception.Message)`n    hint: $hint"
}
Write-Host "    check log: $checkHit"
Start-Sleep -Seconds 1
$win = Wait-Window "Yohu ADB Tools"
Show-LogDelta $appLog $appMark "app.log"

Write-Host "[3] UI: download (if dialog open)"
$cacheDir = Join-Path $env:LOCALAPPDATA "$ProductDataDir\cache\update"
Get-ChildItem $cacheDir -Filter "*setup.exe" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $cacheDir -Filter "*.part" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
try {
    $dl = [string]::new(@([char]0x4E0B, [char]0x8F7D))
    Click-ByName $win $dl 40
    $deadline = (Get-Date).AddSeconds(120)
    $artifact = $null
    while ((Get-Date) -lt $deadline) {
        $artifact = Get-ChildItem $cacheDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($artifact -and $artifact.Length -gt 1MB) { break }
        Start-Sleep -Seconds 2
    }
    if (-not $artifact) { throw "UI download did not produce *setup.exe under $cacheDir" }
    Write-Host "    cached $($artifact.Name) ($([math]::Round($artifact.Length/1MB,2)) MB)"
    Show-LogDelta $appLog $appMark "app.log-download"
} catch {
    Write-Host "    skip download: $($_.Exception.Message)"
}

if ($Install) {
    Write-Host "[4] UI: install now"
    try {
        $win = Wait-Window "Yohu ADB Tools"
        $inst = [string]::new(@([char]0x5B89, [char]0x88C5, [char]0x5E76, [char]0x91CD, [char]0x542F))
        Click-ByName $win $inst 40
        Start-Sleep -Seconds 20
        Show-LogDelta $appLog $appMark "app.log-install"
        Show-LogDelta $applyLog 0 "apply.log"
    } catch {
        Write-Host "    install click failed: $($_.Exception.Message)"
    }
} else {
    Write-Host "[4] skip install (pass -Install for overlay)"
}

Write-Host "Done pid=$($p.Id)"
