//! sidecar 官方 adb 资源目录解析（ADR-v6-008）。
//!
//! 开发与 release 默认布局一致：应用旁 `tools/`（当前平台 adb 可执行文件）。
//! 运行时再幂等复制到 `DataRoot/tools/adb/`，由 `yohu_adb::ToolResolver` 完成。
//! 本模块只负责找出「内置副本」所在目录。

use std::path::{Path, PathBuf};

use tauri::{App, Manager};
use yohu_adb::adb_file_name;
use yohu_protocol::dir;

/// 解析内置官方 adb 所在目录。
///
/// 查找顺序（与开发仓库 `tools/` 对齐）：
/// 1. 可执行文件旁 `tools/`（dev `target/*/tools`、安装目录 `tools/`）
/// 2. Tauri `resource_dir` 下 `tools/`（安装包 resources）
/// 3. 仓库 `tools/`（`cargo tauri dev` 且尚未拷到 target 时）
pub fn resolve_resource_dir(app: &App) -> PathBuf {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.join(dir::TOOLS));
            dirs.push(parent.join("resources").join(dir::TOOLS));
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        dirs.push(res.join(dir::TOOLS));
    }
    dirs.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join(dir::TOOLS),
    );

    for candidate in &dirs {
        if let Some(found) = dir_with_adb(candidate) {
            tracing::info!("sidecar adb 资源目录: {}", found.display());
            return found;
        }
    }

    let fallback = dirs
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from("."));
    tracing::warn!(
        "未找到内置 {}，将使用: {}",
        adb_file_name(),
        fallback.display()
    );
    fallback
}

/// 固定 `base/tools/` 布局下的 `tools/` 目录本身含 adb 即为命中。
fn dir_with_adb(base: &Path) -> Option<PathBuf> {
    if base.join(adb_file_name()).is_file() {
        Some(base.to_path_buf())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dir_with_adb_requires_binary_in_dir() {
        let root =
            std::env::temp_dir().join(format!("yohu-sidecar-{}-{}", std::process::id(), "adb"));
        let _ = std::fs::remove_dir_all(&root);
        let empty = root.join("empty");
        let tools = root.join("nested").join(dir::TOOLS);
        std::fs::create_dir_all(&empty).unwrap();
        std::fs::create_dir_all(&tools).unwrap();
        std::fs::write(tools.join(adb_file_name()), b"nested").unwrap();

        assert!(dir_with_adb(&empty).is_none());
        assert_eq!(dir_with_adb(&tools).as_deref(), Some(tools.as_path()));
        assert!(dir_with_adb(root.join("nested").as_path()).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }
}
