//! 自愈式设备扫描：按候选 adb 逐个 `start-server` + `devices -l`。
//!
//! 运输入口仍是 [`crate::AdbClient`]；本模块只协作「选哪份二进制、采信哪次退出码 0」。
//! 同一候选禁止换另一份 sidecar 抢 5037。

use std::path::Path;
use std::path::PathBuf;
use std::time::Duration;
use std::time::Instant;

use tokio_util::sync::CancellationToken;

use crate::client::AdbClient;
use crate::error::AdbError;
use crate::parse::devices as devices_parse;
use yohu_protocol::DeviceInfo;
use yohu_runtime::ProcessRunner;

const START_SERVER_TIMEOUT_MS: u64 = 20_000;
const DEVICES_LIST_TIMEOUT_MS: u64 = 10_000;

impl AdbClient {
    /// 扫描设备。
    pub async fn devices(&self, cancel: CancellationToken) -> Result<Vec<DeviceInfo>, AdbError> {
        let (devices, _used) = self.devices_resilient(cancel).await?;
        Ok(devices)
    }

    /// 自愈式设备扫描：按候选顺序尝试不同 adb（用户设置 → DataRoot 解压副本）。
    ///
    /// 每个候选先 `start-server` 再 `devices -l`，同一二进制，禁止两份 sidecar 抢 5037。
    /// 任一候选「进程可启动且退出码 0」即采信其结果；失败的候选仅记录并尝试下一个。
    /// 全部失败时返回带明细的错误。返回 (设备列表, 实际使用的 adb 路径)。
    pub async fn devices_resilient(
        &self,
        cancel: CancellationToken,
    ) -> Result<(Vec<DeviceInfo>, PathBuf), AdbError> {
        let tool = self.tool();
        let candidates = tool.candidates();
        if candidates.is_empty() {
            return Err(AdbError::ToolUnavailable(tool.unavailable_hint()));
        }
        let mut failures: Vec<String> = Vec::new();
        tracing::info!(
            candidates = candidates.len(),
            first = %candidates[0].display(),
            "adb devices -l 开始"
        );
        for adb in &candidates {
            if cancel.is_cancelled() {
                return Err(AdbError::Cancelled);
            }
            start_server_at(self.runner(), adb, cancel.clone()).await;
            let t = Instant::now();
            let result = self
                .runner()
                .run_capture(
                    adb,
                    &["devices".into(), "-l".into()],
                    Some(Duration::from_millis(DEVICES_LIST_TIMEOUT_MS)),
                    cancel.clone(),
                )
                .await;
            let ms = t.elapsed().as_millis();
            match result {
                Ok(out) if out.exit_code == 0 => {
                    tracing::info!(
                        adb = %adb.display(),
                        ms,
                        "adb devices -l 成功"
                    );
                    tool.set_preferred(adb.clone());
                    return Ok((devices_parse::parse_devices_list(&out.stdout), adb.clone()));
                }
                Ok(out) => {
                    failures.push(format!("{} (退出码 {})", out.stderr.trim(), out.exit_code));
                    tracing::warn!(
                        adb = %adb.display(),
                        ms,
                        "adb 候选失败 {}",
                        failures.last().unwrap_or(&String::new())
                    );
                }
                Err(e) => {
                    failures.push(e.to_string());
                    tracing::warn!(adb = %adb.display(), ms, "adb 候选不可用 {e}");
                }
            }
        }
        Err(AdbError::BadExit {
            exit_code: -1,
            stderr: format!(
                "全部 adb 候选扫描失败（{} 个）: {}",
                candidates.len(),
                failures.join("；")
            ),
        })
    }
}

/// 对指定 adb 二进制执行 `start-server`。失败不中断，由随后的 `devices -l` 判定该候选。
async fn start_server_at(runner: &ProcessRunner, adb: &Path, cancel: CancellationToken) {
    let t = Instant::now();
    tracing::info!(adb = %adb.display(), "adb start-server 开始");
    let result = runner
        .run_capture(
            adb,
            &["start-server".into()],
            Some(Duration::from_millis(START_SERVER_TIMEOUT_MS)),
            cancel,
        )
        .await;
    let ms = t.elapsed().as_millis();
    match result {
        Ok(out) if out.exit_code == 0 => {
            tracing::info!(ms, adb = %adb.display(), "adb start-server 完成");
        }
        Ok(out) => {
            tracing::warn!(
                ms,
                adb = %adb.display(),
                exit = out.exit_code,
                stderr = %out.stderr.trim(),
                "adb start-server 非零退出，仍尝试 devices -l"
            );
        }
        Err(e) => {
            tracing::warn!(
                ms,
                adb = %adb.display(),
                error = %e,
                "adb start-server 失败，仍尝试 devices -l"
            );
        }
    }
}
