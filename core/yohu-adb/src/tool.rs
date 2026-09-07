//! sidecar adb 工具解析（需求文档 §4.3）。
//!
//! 运行时只保留一份官方 sidecar：用户设置（`adb.path`，可运行时更新、立即生效）→
//! `DataRoot/tools/adb/`（从资源目录解压）。资源目录是安装载荷，解压成功后不再当第二套 adb 用，
//! 避免两份副本抢 5037。本模块零 Tauri 依赖：目录由 app 层解析后传入。

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::error::AdbError;

/// 当前平台需要随包分发的官方 platform-tools 文件。
#[cfg(windows)]
pub const ADB_FILES: &[&str] = &["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"];
#[cfg(not(windows))]
pub const ADB_FILES: &[&str] = &["adb"];

/// 当前平台的 adb 可执行文件名（Windows `adb.exe`，其它 `adb`）。
pub fn adb_file_name() -> &'static str {
    ADB_FILES[0]
}

/// 仓库 `tools/` 下当前平台的官方 adb（集成测试 / 真机用例）。
pub fn repo_sidecar_adb() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tools")
        .join(adb_file_name())
}

/// adb 工具解析器。
#[derive(Clone)]
pub struct ToolResolver {
    /// 用户自定义 adb 路径（设置 `adb.path`；空 = 自动解析；运行时可变）
    user_path: Arc<RwLock<Option<PathBuf>>>,
    /// 最近一次扫描成功的 adb（用户路径损坏时记住可用副本；改 `adb.path` 时清空）
    preferred: Arc<RwLock<Option<PathBuf>>>,
    /// 应用旁工具目录（安装包 resources / 仓库 tools/），内含当前平台 sidecar
    resource_dir: PathBuf,
    /// 解压目标：`DataRoot/tools/adb/`
    data_tools_dir: PathBuf,
}

impl ToolResolver {
    pub fn new(user_path: Option<PathBuf>, resource_dir: PathBuf, data_tools_dir: PathBuf) -> Self {
        Self {
            user_path: Arc::new(RwLock::new(user_path)),
            preferred: Arc::new(RwLock::new(None)),
            resource_dir,
            data_tools_dir,
        }
    }

    /// 记住本次扫描实际用的 adb。
    pub fn set_preferred(&self, path: PathBuf) {
        *self.preferred.write().expect("tool lock poisoned") = Some(path);
    }

    /// 更新用户自定义路径（设置 `adb.path` 立即生效）。新路径必须重新探测，不能沿用旧副本。
    pub fn set_user_path(&self, path: Option<PathBuf>) {
        *self.user_path.write().expect("tool lock poisoned") = path;
        *self.preferred.write().expect("tool lock poisoned") = None;
    }

    /// 解析可用 adb（首个候选）。
    pub fn resolve(&self) -> Result<PathBuf, AdbError> {
        self.candidates()
            .into_iter()
            .next()
            .ok_or_else(|| AdbError::ToolUnavailable(self.unavailable_hint()))
    }

    /// 候选 adb 路径（去重，仅存在的文件）。
    /// 用户设置 → DataRoot 解压副本；解压失败才用资源目录原件。
    pub fn candidates(&self) -> Vec<PathBuf> {
        let mut out: Vec<PathBuf> = Vec::new();
        let mut push = |p: PathBuf| {
            if p.is_file() && !out.contains(&p) {
                out.push(p);
            }
        };
        if let Some(p) = self.preferred.read().expect("tool lock poisoned").clone() {
            push(p);
        }
        if let Some(p) = self.user_path.read().expect("tool lock poisoned").clone() {
            if p.is_file() {
                push(p);
            } else {
                tracing::warn!("adb.path 指向的文件不存在: {}", p.display());
            }
        }
        let extracted = self.data_tools_dir.join(adb_file_name());
        if self.ensure_extracted().is_ok() && extracted.is_file() {
            push(extracted);
        } else {
            push(self.resource_dir.join(adb_file_name()));
        }
        out
    }

    pub fn unavailable_hint(&self) -> String {
        format!(
            "资源目录与数据目录均无 {}: {} / {}",
            adb_file_name(),
            self.resource_dir.display(),
            self.data_tools_dir.display()
        )
    }

    /// 从资源目录复制 sidecar 到数据目录（幂等；Unix 补可执行位）。
    pub fn ensure_extracted(&self) -> Result<(), AdbError> {
        std::fs::create_dir_all(&self.data_tools_dir)?;
        for name in ADB_FILES {
            let src = self.resource_dir.join(name);
            if !src.is_file() {
                continue;
            }
            let dst = self.data_tools_dir.join(name);
            if !dst.is_file() {
                std::fs::copy(&src, &dst)?;
                tracing::info!("已解压 adb 工具: {}", dst.display());
            }
            yohu_runtime::ensure_executable(&dst)?;
        }
        Ok(())
    }

    /// 预热（启动时调用，不阻塞窗口；失败仅记录，后续 resolve 会兜底重试）。
    pub async fn warm_up(&self) {
        let this = self.clone();
        match tokio::task::spawn_blocking(move || this.ensure_extracted()).await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!("adb 预热解压失败: {e}"),
            Err(e) => tracing::warn!("adb 预热解压失败: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn extract_copies_adb_trio_into_data_dir() {
        let root = std::env::temp_dir().join(format!(
            "yohu-tool-extract-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&root);
        let resource = root.join("res");
        let data = root.join("data");
        fs::create_dir_all(&resource).unwrap();
        for name in ADB_FILES {
            fs::write(resource.join(name), name.as_bytes()).unwrap();
        }

        let tool = ToolResolver::new(None, resource.clone(), data.clone());
        tool.ensure_extracted().unwrap();
        for name in ADB_FILES {
            assert_eq!(fs::read_to_string(data.join(name)).unwrap(), *name);
        }

        let candidates = tool.candidates();
        let extracted = data.join(adb_file_name());
        assert_eq!(candidates, vec![extracted.clone()]);
        assert_ne!(
            candidates.first(),
            Some(&resource.join(adb_file_name())),
            "解压成功后不得再把资源目录原件列为第二套 adb"
        );

        let preferred = extracted;
        tool.set_preferred(preferred.clone());
        assert_eq!(tool.candidates(), vec![preferred.clone()]);

        tool.set_user_path(Some(resource.join(adb_file_name())));
        let after_user = tool.candidates();
        assert_eq!(after_user.first(), Some(&resource.join(adb_file_name())));
        assert_eq!(after_user.len(), 2, "用户路径 + 解压副本");
        let _ = fs::remove_dir_all(&root);
    }
}
