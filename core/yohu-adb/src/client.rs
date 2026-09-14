//! ADB 客户端门面：组合 ToolResolver / ProcessRunner / 解析器。
//!
//! 职责边界：本层只做「调用 adb + 解析输出」，**不判定成败**（ADR-v6-009）。
//! 自愈扫描在 `scan`；`readlink -f` 解析在 [`crate::parse::readlink`]。

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{mpsc, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::error::AdbError;
use crate::parse::{
    ls as ls_parse, packages as packages_parse, ps as ps_parse, readlink as readlink_parse,
    status as status_parse, uimode as uimode_parse,
};
use crate::tool::ToolResolver;
use yohu_protocol::{ExecOutcome, ProcessEntry, RemoteEntry};
use yohu_runtime::{ChildHandle, ProcessError, ProcessOutput, ProcessRunner};

/// 各 ADB 短命令超时（ms）——单源，避免业务分支散落魔法数。
const CLEAR_LOG_TIMEOUT_MS: u64 = 10_000;
const LIST_LS_TIMEOUT_MS: u64 = 15_000;
const LIST_PS_TIMEOUT_MS: u64 = 15_000;
const LIST_PACKAGES_TIMEOUT_MS: u64 = 15_000;
const READLINK_TIMEOUT_MS: u64 = 10_000;
const UI_MODE_TIMEOUT_MS: u64 = 8_000;
const STATUS_SAMPLE_TIMEOUT_MS: u64 = 8_000;
const STATUS_PROPS_TIMEOUT_MS: u64 = 5_000;

/// ADB 客户端。
pub struct AdbClient {
    /// 工具解析（adb.path 运行时更新 → 每次执行重新解析，立即生效）
    tool: ToolResolver,
    runner: ProcessRunner,
    /// ADB server 全局并发限流（短命令）
    limit: Arc<Semaphore>,
}

impl AdbClient {
    pub fn new(tool: ToolResolver, max_concurrency: usize) -> Self {
        Self {
            tool,
            runner: ProcessRunner,
            limit: Arc::new(Semaphore::new(max_concurrency.max(1))),
        }
    }

    pub(crate) fn tool(&self) -> &ToolResolver {
        &self.tool
    }

    pub(crate) fn runner(&self) -> &ProcessRunner {
        &self.runner
    }

    /// 更新用户自定义 adb 路径（设置立即生效）。
    pub fn set_user_path(&self, path: Option<std::path::PathBuf>) {
        self.tool.set_user_path(path);
    }

    fn resolve_adb(&self) -> Result<std::path::PathBuf, AdbError> {
        self.tool.resolve()
    }

    /// 构造 argv（带设备前缀）。
    fn argv_with_serial(serial: &str, argv: &[String]) -> Vec<String> {
        let mut full = Vec::with_capacity(argv.len() + 2);
        if !serial.is_empty() {
            full.push("-s".into());
            full.push(serial.into());
        }
        full.extend(argv.iter().cloned());
        full
    }

    /// 短命令：捕获输出与退出码。
    pub async fn run(
        &self,
        serial: &str,
        argv: &[String],
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, AdbError> {
        let _permit = self
            .limit
            .acquire()
            .await
            .map_err(|_| AdbError::Cancelled)?;
        let timeout = timeout_ms.map(Duration::from_millis);
        let adb = self.resolve_adb()?;
        let out = self
            .runner
            .run_capture(&adb, &Self::argv_with_serial(serial, argv), timeout, cancel)
            .await?;
        outcome_or_offline(out)
    }

    /// 长驻进程：不占短命令信号量；调用方负责泵输出与 [`ChildHandle::kill_tree`]。
    pub fn spawn_long_lived(&self, serial: &str, argv: &[String]) -> Result<ChildHandle, AdbError> {
        let adb = self.resolve_adb()?;
        Ok(self
            .runner
            .spawn_child(&adb, &Self::argv_with_serial(serial, argv))?)
    }

    /// 流式命令：stdout 逐行转发（logcat 采集用）。
    pub async fn stream_lines(
        &self,
        serial: &str,
        argv: &[String],
        cancel: CancellationToken,
        line_tx: mpsc::Sender<String>,
    ) -> Result<i32, AdbError> {
        let adb = self.resolve_adb()?;
        match self
            .runner
            .run_streaming(&adb, &Self::argv_with_serial(serial, argv), cancel, line_tx)
            .await
        {
            Ok(code) => Ok(code),
            Err(ProcessError::BadExit { stderr, .. }) if is_device_offline(&stderr) => {
                Err(AdbError::DeviceOffline(stderr.trim().to_string()))
            }
            Err(e) => Err(e.into()),
        }
    }

    /// 清设备日志缓冲（`logcat -c`）。
    pub async fn clear_log(&self, serial: &str, cancel: CancellationToken) -> Result<(), AdbError> {
        let out = self
            .run(
                serial,
                &["logcat".into(), "-c".into()],
                Some(CLEAR_LOG_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(())
    }

    /// 浏览设备目录。
    pub async fn ls(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "ls".into(),
                    "-lla".into(),
                    crate::shell_quote(path),
                ],
                Some(LIST_LS_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(ls_parse::parse_ls(&out.stdout))
    }

    /// 解析设备侧路径的规范路径（`adb shell readlink -f`）。用于符号链接逃逸守卫（ADR-v6-013）。
    ///
    /// 超时只在本层 `READLINK_TIMEOUT_MS`。结果为 `ReadlinkF`：Canonical / Missing / Unparseable。
    /// 运输错误（掉线/超时/取消）为 `Err`。禁止把无法解析当成放行。
    pub async fn readlink_f(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<readlink_parse::ReadlinkF, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "readlink".into(),
                    "-f".into(),
                    crate::shell_quote(path),
                ],
                Some(READLINK_TIMEOUT_MS),
                cancel,
            )
            .await?;
        let result = readlink_parse::interpret_readlink_f(out.exit_code, &out.stdout, &out.stderr);
        if matches!(result, readlink_parse::ReadlinkF::Unparseable) {
            tracing::debug!(path = %path, exit = out.exit_code, stderr = %out.stderr, "readlink -f 无法解析");
        }
        Ok(result)
    }

    /// 进程索引。
    pub async fn ps(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<ProcessEntry>, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "ps".into(),
                    "-A".into(),
                    "-o".into(),
                    "PID,NAME".into(),
                ],
                Some(LIST_PS_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(ps_parse::parse_ps(&out.stdout))
    }

    /// 已安装包名（`pm list packages`；失败则 `cmd package list packages`）。
    pub async fn list_packages(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<String>, AdbError> {
        let pm = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "pm".into(),
                    "list".into(),
                    "packages".into(),
                ],
                Some(LIST_PACKAGES_TIMEOUT_MS),
                cancel.clone(),
            )
            .await?;
        if pm.exit_code == 0 && !pm.stdout.trim().is_empty() {
            return Ok(packages_parse::parse_pm_list_packages(&pm.stdout));
        }
        let cmd = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "cmd".into(),
                    "package".into(),
                    "list".into(),
                    "packages".into(),
                ],
                Some(LIST_PACKAGES_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if cmd.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: if pm.exit_code != 0 {
                    pm.exit_code
                } else {
                    cmd.exit_code
                },
                stderr: format!("pm: {}; cmd package: {}", pm.stderr, cmd.stderr),
            });
        }
        Ok(packages_parse::parse_pm_list_packages(&cmd.stdout))
    }

    /// 写设备深浅色（`cmd uimode night yes|no`）。读回应走 [`Self::sample_status`]。
    pub async fn set_night_mode(
        &self,
        serial: &str,
        night: bool,
        cancel: CancellationToken,
    ) -> Result<(), AdbError> {
        let arg = if night { "yes" } else { "no" };
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "cmd".into(),
                    "uimode".into(),
                    "night".into(),
                    arg.into(),
                ],
                Some(UI_MODE_TIMEOUT_MS),
                cancel.clone(),
            )
            .await?;
        if out.exit_code != 0 {
            let fallback = uimode_parse::settings_night_mode_value(night).to_string();
            let put = self
                .run(
                    serial,
                    &[
                        "shell".into(),
                        "settings".into(),
                        "put".into(),
                        "secure".into(),
                        "ui_night_mode".into(),
                        fallback,
                    ],
                    Some(UI_MODE_TIMEOUT_MS),
                    cancel.clone(),
                )
                .await?;
            if put.exit_code != 0 {
                return Err(AdbError::BadExit {
                    exit_code: out.exit_code,
                    stderr: format!("cmd uimode: {}; settings: {}", out.stderr, put.stderr),
                });
            }
        }
        Ok(())
    }

    /// 快路径：只读 SDK / Android 版本 / 品牌，供首采先推。
    pub async fn sample_props(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<status_parse::DeviceStatusFields, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "sh".into(),
                    "-c".into(),
                    status_parse::PROPS_SCRIPT.into(),
                ],
                Some(STATUS_PROPS_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 && out.stdout.trim().is_empty() {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(status_parse::parse_props_output(&out.stdout))
    }

    /// 一次 shell 采齐夜览/电量/SDK/亮屏等运行时字段。
    pub async fn sample_status(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<status_parse::DeviceStatusFields, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "sh".into(),
                    "-c".into(),
                    status_parse::SAMPLE_SCRIPT.into(),
                ],
                Some(STATUS_SAMPLE_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 && out.stdout.trim().is_empty() {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(status_parse::parse_status_bundle(&out.stdout))
    }
}

fn outcome_or_offline(out: ProcessOutput) -> Result<ExecOutcome, AdbError> {
    if out.exit_code != 0 && is_device_offline(&out.stderr) {
        return Err(AdbError::DeviceOffline(out.stderr.trim().to_string()));
    }
    Ok(ExecOutcome {
        exit_code: out.exit_code,
        stdout: out.stdout,
        stderr: out.stderr,
    })
}

/// adb 掉线/无设备特征（stderr 判定）。
fn is_device_offline(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    [
        "device offline",
        "device not found",
        "no devices/emulators found",
        "device 'offline'",
    ]
    .iter()
    .any(|k| lower.contains(k))
}

/// 实现 domain 执行端口（依赖倒置：适配层映射错误类型）。
impl yohu_domain::Runner for AdbClient {
    async fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, yohu_domain::RunError> {
        self.run(serial, &argv, timeout_ms, cancel)
            .await
            .map_err(Into::into)
    }
}
