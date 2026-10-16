//! 危险操作（删除/新建/重命名）：core 侧 SafetyRoot + 末段名强制校验。
//!
//! 变更超时只在本文件。`readlink -f` 超时在运输层。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, FileError};
use crate::guard::{normalize_mut, resolve_and_recheck, sibling_rename, RecheckKind};
use yohu_adb::shell_quote;
use yohu_adb::AdbClient;
use yohu_domain::{RemotePath, SafetyRoot};

const DELETE_TIMEOUT_MS: u64 = 30_000;
const MUTATE_TIMEOUT_MS: u64 = 15_000;

/// 设备文件变更器。
pub struct FileMutator {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl FileMutator {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
        }
    }

    /// 删除（递归）。**必须通过安全根校验**，用户确认由 UI 负责、core 二次强制。
    pub async fn delete(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = normalize_mut(&self.safety, path)?;
        resolve_and_recheck(
            &self.adb,
            &self.safety,
            serial,
            &normalized,
            RecheckKind::Descendant,
            cancel.clone(),
        )
        .await?;
        finish_shell(
            &self.adb,
            serial,
            &[
                "shell".into(),
                "rm".into(),
                "-rf".into(),
                shell_quote(normalized.as_str()),
            ],
            DELETE_TIMEOUT_MS,
            normalized.as_str(),
            cancel,
        )
        .await
    }

    /// 新建目录（`mkdir -p`）。
    pub async fn mkdir(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = normalize_mut(&self.safety, path)?;
        resolve_and_recheck(
            &self.adb,
            &self.safety,
            serial,
            &normalized,
            RecheckKind::Descendant,
            cancel.clone(),
        )
        .await?;
        finish_shell(
            &self.adb,
            serial,
            &[
                "shell".into(),
                "mkdir".into(),
                "-p".into(),
                shell_quote(normalized.as_str()),
            ],
            MUTATE_TIMEOUT_MS,
            normalized.as_str(),
            cancel,
        )
        .await
    }

    /// 新建空文件（`touch`；已存在则只更新时间）。
    pub async fn create_file(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = normalize_mut(&self.safety, path)?;
        resolve_and_recheck(
            &self.adb,
            &self.safety,
            serial,
            &normalized,
            RecheckKind::Descendant,
            cancel.clone(),
        )
        .await?;
        finish_shell(
            &self.adb,
            serial,
            &[
                "shell".into(),
                "touch".into(),
                shell_quote(normalized.as_str()),
            ],
            MUTATE_TIMEOUT_MS,
            normalized.as_str(),
            cancel,
        )
        .await
    }

    /// 重命名（同目录换名，`mv`）。落点由本方法拼，源与落点各自过安全根。
    /// 设备 `mv` 静默覆盖同名条目，所以落点先问一次占用，不覆盖。
    pub async fn rename(
        &self,
        serial: &str,
        path: &str,
        name: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let source = normalize_mut(&self.safety, path)?;
        let target = sibling_rename(&self.safety, &source, name)?;
        resolve_and_recheck(
            &self.adb,
            &self.safety,
            serial,
            &source,
            RecheckKind::Descendant,
            cancel.clone(),
        )
        .await?;
        resolve_and_recheck(
            &self.adb,
            &self.safety,
            serial,
            &target,
            RecheckKind::Descendant,
            cancel.clone(),
        )
        .await?;
        reject_taken(&self.adb, serial, &target, cancel.clone()).await?;
        finish_shell(
            &self.adb,
            serial,
            &[
                "shell".into(),
                "mv".into(),
                shell_quote(source.as_str()),
                shell_quote(target.as_str()),
            ],
            MUTATE_TIMEOUT_MS,
            source.as_str(),
            cancel,
        )
        .await
    }
}

/// 落点占用探测。`ls -d` 的退出码即答案：只有「远端不存在」算空位，其余失败原样上抛。
async fn reject_taken(
    adb: &AdbClient,
    serial: &str,
    target: &RemotePath,
    cancel: CancellationToken,
) -> Result<(), FileError> {
    let probe = finish_shell(
        adb,
        serial,
        &[
            "shell".into(),
            "ls".into(),
            "-d".into(),
            shell_quote(target.as_str()),
        ],
        MUTATE_TIMEOUT_MS,
        target.as_str(),
        cancel,
    )
    .await;
    match probe {
        Ok(()) => Err(FileError::AlreadyExists(target.as_str().to_string())),
        Err(FileError::RemoteNotFound(_)) => Ok(()),
        Err(other) => Err(other),
    }
}

/// 短 shell 的运输失败与非零退出都收成 `FileError`。传输流的退出码不走这里。
async fn finish_shell(
    adb: &AdbClient,
    serial: &str,
    argv: &[String],
    timeout_ms: u64,
    path: &str,
    cancel: CancellationToken,
) -> Result<(), FileError> {
    let out = adb
        .run(serial, argv, Some(timeout_ms), cancel)
        .await
        .map_err(|e| file_error_from_adb(path, e))?;
    if out.exit_code != 0 {
        return Err(file_error_from_adb(
            path,
            yohu_adb::AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            },
        ));
    }
    Ok(())
}
