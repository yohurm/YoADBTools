//! 危险操作（删除/新建）：core 侧 SafetyRoot + 末段名强制校验。
//!
//! 变更超时只在本文件。`readlink -f` 超时在运输层。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, FileError};
use crate::guard::{normalize_mut, resolve_and_recheck, RecheckKind};
use yohu_adb::shell_quote;
use yohu_adb::AdbClient;
use yohu_domain::SafetyRoot;

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
        let out = self
            .adb
            .run(
                serial,
                &[
                    "shell".into(),
                    "rm".into(),
                    "-rf".into(),
                    shell_quote(normalized.as_str()),
                ],
                Some(DELETE_TIMEOUT_MS),
                cancel,
            )
            .await
            .map_err(|e| file_error_from_adb(normalized.as_str(), e))?;
        if out.exit_code != 0 {
            return Err(file_error_from_adb(
                normalized.as_str(),
                yohu_adb::AdbError::BadExit {
                    exit_code: out.exit_code,
                    stderr: out.stderr,
                },
            ));
        }
        Ok(())
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
        let out = self
            .adb
            .run(
                serial,
                &[
                    "shell".into(),
                    "mkdir".into(),
                    "-p".into(),
                    shell_quote(normalized.as_str()),
                ],
                Some(MUTATE_TIMEOUT_MS),
                cancel,
            )
            .await
            .map_err(|e| file_error_from_adb(normalized.as_str(), e))?;
        if out.exit_code != 0 {
            return Err(file_error_from_adb(
                normalized.as_str(),
                yohu_adb::AdbError::BadExit {
                    exit_code: out.exit_code,
                    stderr: out.stderr,
                },
            ));
        }
        Ok(())
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
        let out = self
            .adb
            .run(
                serial,
                &[
                    "shell".into(),
                    "touch".into(),
                    shell_quote(normalized.as_str()),
                ],
                Some(MUTATE_TIMEOUT_MS),
                cancel,
            )
            .await
            .map_err(|e| file_error_from_adb(normalized.as_str(), e))?;
        if out.exit_code != 0 {
            return Err(file_error_from_adb(
                normalized.as_str(),
                yohu_adb::AdbError::BadExit {
                    exit_code: out.exit_code,
                    stderr: out.stderr,
                },
            ));
        }
        Ok(())
    }
}
