//! sidecar adb 工具解析（需求文档 §4.3）。
//!
//! 运行时优先一份官方 sidecar：用户设置（`adb.path`，可运行时更新、立即生效）→
//! `DataRoot/tools/adb/`（从资源目录解压）。资源目录是安装载荷，解压成功后不再当第二套 adb 用，
//! 避免两份副本抢 5037。Linux 在 sidecar 缺失时再找 `ANDROID_HOME` / `ANDROID_SDK_ROOT` /
//! `~/Android/Sdk` / `PATH` 里的可执行 `adb`。本模块零 Tauri 依赖：目录由 app 层解析后传入。

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use crate::error::AdbError;
use yohu_protocol::dir;

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
    /// Linux 在 sidecar 缺失时才查的本机搜索面。测试传入空面，不读进程环境。
    #[cfg(target_os = "linux")]
    system_search: AdbSearch,
}

fn lock_tool<T>(result: Result<T, std::sync::PoisonError<T>>) -> T {
    result.expect("tool lock poisoned")
}

impl ToolResolver {
    pub fn new(user_path: Option<PathBuf>, resource_dir: PathBuf, data_tools_dir: PathBuf) -> Self {
        Self::from_parts(
            user_path,
            resource_dir,
            data_tools_dir,
            #[cfg(target_os = "linux")]
            AdbSearch::from_env(),
        )
    }

    /// 指定本机搜索面。集成测试传 [`AdbSearch::empty`]，避免读到运行机上的 `ANDROID_HOME`。
    #[cfg(target_os = "linux")]
    pub fn with_system_search(
        user_path: Option<PathBuf>,
        resource_dir: PathBuf,
        data_tools_dir: PathBuf,
        system_search: AdbSearch,
    ) -> Self {
        Self::from_parts(user_path, resource_dir, data_tools_dir, system_search)
    }

    fn from_parts(
        user_path: Option<PathBuf>,
        resource_dir: PathBuf,
        data_tools_dir: PathBuf,
        #[cfg(target_os = "linux")] system_search: AdbSearch,
    ) -> Self {
        Self {
            user_path: Arc::new(RwLock::new(user_path)),
            preferred: Arc::new(RwLock::new(None)),
            resource_dir,
            data_tools_dir,
            #[cfg(target_os = "linux")]
            system_search,
        }
    }

    /// 记住本次扫描实际用的 adb。
    pub fn set_preferred(&self, path: PathBuf) {
        *lock_tool(self.preferred.write()) = Some(path);
    }

    /// 更新用户自定义路径（设置 `adb.path` 立即生效）。新路径必须重新探测，不能沿用旧副本。
    pub fn set_user_path(&self, path: Option<PathBuf>) {
        *lock_tool(self.user_path.write()) = path;
        *lock_tool(self.preferred.write()) = None;
    }

    /// 解析可用 adb（首个候选）。
    pub fn resolve(&self) -> Result<PathBuf, AdbError> {
        match self.candidates().into_iter().next() {
            Some(path) => Ok(path),
            None => {
                tracing::error!("{}", self.unavailable_hint());
                Err(AdbError::ToolUnavailable)
            }
        }
    }

    /// 候选 adb 路径（去重，仅存在的文件）。
    /// 用户设置 → DataRoot 解压副本；解压失败才用资源目录原件。
    pub fn candidates(&self) -> Vec<PathBuf> {
        let mut out: Vec<PathBuf> = Vec::new();
        let mut push = |p: PathBuf| {
            if !p.is_file() || out.contains(&p) {
                return;
            }
            let _ = yohu_runtime::ensure_executable(&p);
            if !usable_adb(&p) {
                return;
            }
            out.push(p);
        };
        if let Some(p) = lock_tool(self.preferred.read()).clone() {
            push(p);
        }
        if let Some(p) = lock_tool(self.user_path.read()).clone() {
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
            #[cfg(target_os = "linux")]
            {
                for extra in discover_adb(&self.system_search) {
                    push(extra);
                }
            }
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

    /// 从资源目录复制 sidecar 到数据目录。源 size+mtime 与 stamp 不一致则覆盖。
    pub fn ensure_extracted(&self) -> Result<(), AdbError> {
        std::fs::create_dir_all(&self.data_tools_dir)?;
        let stamp_path = self.data_tools_dir.join(dir::SIDECAR_STAMP);
        let wanted = sidecar_stamp(&self.resource_dir);
        let current = std::fs::read_to_string(&stamp_path).unwrap_or_default();
        let refresh = !wanted.is_empty() && wanted != current;
        for name in ADB_FILES {
            let src = self.resource_dir.join(name);
            if !src.is_file() {
                continue;
            }
            let dst = self.data_tools_dir.join(name);
            if refresh || !dst.is_file() {
                std::fs::copy(&src, &dst)?;
                tracing::info!("已解压 adb 工具: {}", dst.display());
            }
            yohu_runtime::ensure_executable(&dst)?;
        }
        if !wanted.is_empty() {
            std::fs::write(&stamp_path, wanted)?;
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

fn usable_adb(path: &Path) -> bool {
    let Ok(meta) = path.metadata() else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// 本机 adb 搜索面。运行时从环境变量读；测试构造空面或指定目录。
/// 只在 Linux 存在：Windows / macOS 的 sidecar 缺失不再扫本机 SDK。
#[cfg(target_os = "linux")]
#[derive(Debug, Clone)]
pub struct AdbSearch {
    android_home: Option<PathBuf>,
    android_sdk_root: Option<PathBuf>,
    home: Option<PathBuf>,
    path_entries: Vec<PathBuf>,
}

#[cfg(target_os = "linux")]
impl AdbSearch {
    /// 不查 SDK，也不扫 `PATH`。
    pub fn empty() -> Self {
        Self {
            android_home: None,
            android_sdk_root: None,
            home: None,
            path_entries: Vec::new(),
        }
    }

    fn from_env() -> Self {
        let path_entries = std::env::var_os("PATH")
            .map(|raw| std::env::split_paths(&raw).collect())
            .unwrap_or_default();
        Self {
            android_home: std::env::var_os("ANDROID_HOME").map(PathBuf::from),
            android_sdk_root: std::env::var_os("ANDROID_SDK_ROOT").map(PathBuf::from),
            home: std::env::var_os("HOME").map(PathBuf::from),
            path_entries,
        }
    }
}

/// SDK 与 `PATH` 上的可执行 `adb`。已有 sidecar 时不要调用，避免第二套 adb 抢 5037。
#[cfg(target_os = "linux")]
fn discover_adb(search: &AdbSearch) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut push = |p: PathBuf| {
        if usable_adb(&p) && !out.contains(&p) {
            out.push(p);
        }
    };
    if let Some(home) = &search.android_home {
        push(home.join("platform-tools").join(adb_file_name()));
    }
    if let Some(root) = &search.android_sdk_root {
        push(root.join("platform-tools").join(adb_file_name()));
    }
    if let Some(home) = &search.home {
        push(
            home.join("Android")
                .join("Sdk")
                .join("platform-tools")
                .join(adb_file_name()),
        );
    }
    for dir in &search.path_entries {
        push(dir.join(adb_file_name()));
    }
    out
}

fn sidecar_stamp(resource_dir: &std::path::Path) -> String {
    let mut out = String::new();
    for name in ADB_FILES {
        let src = resource_dir.join(name);
        let Ok(meta) = src.metadata() else {
            continue;
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        out.push_str(&format!("{}:{}:{mtime}\n", name, meta.len()));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn missing_adb_sentence_has_no_path() {
        let root = std::env::temp_dir().join(format!(
            "yohu-tool-missing-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&root);
        let resource = root.join("res");
        let data = root.join("data");
        let tool = ToolResolver::new(None, resource.clone(), data);
        match tool.resolve() {
            Err(err) => {
                assert!(matches!(err, AdbError::ToolUnavailable));
                assert_eq!(err.to_string(), yohu_domain::TOOL_UNAVAILABLE);
                assert!(tool
                    .unavailable_hint()
                    .contains(&resource.display().to_string()));
                assert!(!err.to_string().contains(&root.display().to_string()));
            }
            Ok(path) => {
                assert!(path.is_file());
                assert!(
                    !path.starts_with(&resource),
                    "空资源目录不得把不存在的 sidecar 当成 adb"
                );
            }
        }
        let _ = fs::remove_dir_all(&root);
    }

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
            #[cfg(unix)]
            {
                assert!(usable_adb(&data.join(name)), "{name} 解压后必须可执行");
            }
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

    #[test]
    fn extract_overwrites_when_source_stamp_changes() {
        let root = std::env::temp_dir().join(format!(
            "yohu-tool-stamp-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&root);
        let resource = root.join("res");
        let data = root.join("data");
        fs::create_dir_all(&resource).unwrap();
        for name in ADB_FILES {
            fs::write(resource.join(name), b"v1").unwrap();
        }
        let tool = ToolResolver::new(None, resource.clone(), data.clone());
        tool.ensure_extracted().unwrap();
        assert_eq!(
            fs::read_to_string(data.join(adb_file_name())).unwrap(),
            "v1"
        );

        for name in ADB_FILES {
            fs::write(resource.join(name), b"v2-longer").unwrap();
        }
        tool.ensure_extracted().unwrap();
        assert_eq!(
            fs::read_to_string(data.join(adb_file_name())).unwrap(),
            "v2-longer"
        );
        assert!(data.join(yohu_protocol::dir::SIDECAR_STAMP).is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn discover_adb_reads_sdk_then_path_and_skips_non_executable() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!(
            "yohu-tool-discover-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&root);
        let sdk = root.join("sdk").join("platform-tools");
        let path_dir = root.join("bin");
        fs::create_dir_all(&sdk).unwrap();
        fs::create_dir_all(&path_dir).unwrap();
        let sdk_adb = sdk.join(adb_file_name());
        let path_adb = path_dir.join(adb_file_name());
        fs::write(&sdk_adb, b"sdk").unwrap();
        fs::write(&path_adb, b"path").unwrap();
        let mut path_entries = vec![path_dir];
        let inert_dir = root.join("inert");
        let inert = inert_dir.join(adb_file_name());
        fs::create_dir_all(&inert_dir).unwrap();
        fs::write(&inert, b"noexec").unwrap();
        path_entries.push(inert_dir);
        for path in [&sdk_adb, &path_adb] {
            let mut perms = fs::metadata(path).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(path, perms).unwrap();
        }

        let found = discover_adb(&AdbSearch {
            android_home: Some(root.join("sdk")),
            android_sdk_root: None,
            home: Some(root.join("missing-home")),
            path_entries,
        });
        assert_eq!(found, vec![sdk_adb, path_adb]);
        let _ = fs::remove_dir_all(&root);
    }
}
