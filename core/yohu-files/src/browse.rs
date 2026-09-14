//! 设备文件浏览（ls 解析）。树展开见 [`crate::tree`]。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::fault::{file_error_from_adb, FileError};
use crate::guard::{normalize_browse, resolve_and_recheck, RecheckKind};
use yohu_adb::AdbClient;
use yohu_domain::SafetyRoot;
use yohu_protocol::RemoteEntry;

/// 文件浏览器。
pub struct FileBrowser {
    pub(crate) adb: Arc<AdbClient>,
    pub(crate) safety: SafetyRoot,
}

impl FileBrowser {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
        }
    }

    /// 列出设备目录。词典 `check` + 祖先 realpath 复核；不信任 UI。
    ///
    /// 尾斜杠语义：`ls -lla /sdcard/` 会跟随符号链接列出目标目录内容
    /// （部分机型 `/sdcard -> /storage/self/primary`，不带尾斜杠只列出链接本身）。
    pub async fn list(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, FileError> {
        let normalized = normalize_browse(&self.safety, path)?;
        resolve_and_recheck(
            &self.adb,
            &self.safety,
            serial,
            &normalized,
            RecheckKind::Inclusive,
            cancel.clone(),
        )
        .await?;
        let listing = format!("{}/", normalized.as_str());
        self.adb
            .ls(serial, &listing, cancel)
            .await
            .map_err(|e| file_error_from_adb(normalized.as_str(), e))
    }
}
