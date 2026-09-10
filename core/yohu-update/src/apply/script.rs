//! Windows 覆盖助手脚本：等 PID → 退避重试 NSIS → 记日志 → 拉起。

use super::plan::{NSIS_OVERLAY_ARGS, SETTLE_SECS, SETUP_TRIES, WAIT_PID_MINUTES};

/// 由 [`super::ApplyPlan`] 写入 `cache/update/apply-update.ps1`。
pub fn apply_script() -> String {
    let flags = NSIS_OVERLAY_ARGS
        .iter()
        .map(|f| format!("'{f}'"))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        r#"param(
  [Parameter(Mandatory=$true)][int]$WaitPid,
  [Parameter(Mandatory=$true)][string]$Setup,
  [Parameter(Mandatory=$true)][string]$App,
  [Parameter(Mandatory=$true)][string]$Log
)
$ErrorActionPreference = 'Continue'
function Write-ApplyLog([string]$Msg) {{
  $line = '{{0:o}} {{1}}' -f (Get-Date), $Msg
  Add-Content -LiteralPath $Log -Value $line -Encoding utf8
}}
Write-ApplyLog "wait pid=$WaitPid setup=$Setup app=$App"
$deadline = (Get-Date).AddMinutes({WAIT_PID_MINUTES})
while ((Get-Date) -lt $deadline) {{
  if (-not (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue)) {{ break }}
  Start-Sleep -Seconds 1
}}
if (Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) {{
  Write-ApplyLog 'timeout waiting for pid'
}}
Start-Sleep -Seconds {SETTLE_SECS}
if (-not (Test-Path -LiteralPath $Setup)) {{
  Write-ApplyLog 'setup missing'
  exit 2
}}
$nsisArgs = @({flags})
$delay = 1
$ok = $false
foreach ($try in 1..{SETUP_TRIES}) {{
  Write-ApplyLog "setup try=$try args=$($nsisArgs -join ' ')"
  $p = Start-Process -FilePath $Setup -ArgumentList $nsisArgs -Wait -PassThru
  if ($null -eq $p) {{
    Write-ApplyLog 'Start-Process returned null'
    Start-Sleep -Seconds $delay
    $delay = $delay * 2
    continue
  }}
  Write-ApplyLog "setup exit=$($p.ExitCode)"
  if ($p.ExitCode -eq 0) {{ $ok = $true; break }}
  Start-Sleep -Seconds $delay
  $delay = $delay * 2
}}
if (-not $ok) {{
  Write-ApplyLog 'setup failed'
  exit 4
}}
Remove-Item -LiteralPath $Setup -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
if (Test-Path -LiteralPath $App) {{
  Write-ApplyLog "relaunch $App"
  Start-Process -FilePath $App
  exit 0
}}
Write-ApplyLog "relaunch missing $App"
exit 5
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::apply::plan::NSIS_OVERLAY_ARGS;

    #[test]
    fn script_waits_retries_and_uses_overlay_flags() {
        let script = apply_script();
        assert!(script.contains("Get-Process -Id $WaitPid"));
        assert!(script.contains("/UPDATE"));
        assert!(script.contains("/NS"));
        assert!(script.contains("/S"));
        assert!(!script.contains("/R"));
        assert!(script.contains("Write-ApplyLog"));
        assert!(script.contains("setup try="));
        for flag in NSIS_OVERLAY_ARGS {
            assert!(script.contains(&format!("'{flag}'")));
        }
    }
}
