//! 路径规划：安装根与产品家园分离（ADR-v6-031）。
//!
//! ```text
//! %LOCALAPPDATA%\Programs\<DATA_DIR_NAME>\   # 安装根（载荷）
//! %LOCALAPPDATA%\<DATA_DIR_NAME>\            # 产品家园，不随 data_root 迁移
//! ├── config\settings.json
//! ├── logs\
//! ├── cache\webview\ | update\ | drag-out\
//! └── data\                                  # DataRoot（可配置，重启生效）
//!     ├── tools\adb\
//!     └── modules\
//! ```

use std::path::{Path, PathBuf};

use yohu_protocol::{dir, module_id, AppPathCatalog, DATA_DIR_NAME};
use yohu_runtime::{app_data_root, app_install_root};

/// 应用路径集（启动时冻结；`data_root` 重启生效）。
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub local_root: PathBuf,
    pub install_dir: PathBuf,
    pub data_root: PathBuf,
    pub config_dir: PathBuf,
    pub settings_file: PathBuf,
    pub logs_dir: PathBuf,
    pub cache_dir: PathBuf,
}

impl AppPaths {
    pub fn local_root() -> PathBuf {
        app_data_root(DATA_DIR_NAME)
    }

    pub fn install_dir() -> PathBuf {
        app_install_root(DATA_DIR_NAME)
    }

    pub fn default_logs_dir() -> PathBuf {
        Self::local_root().join(dir::LOGS)
    }

    pub fn default_cache_dir() -> PathBuf {
        Self::local_root().join(dir::CACHE)
    }

    pub fn default_webview_dir() -> PathBuf {
        Self::default_cache_dir().join(dir::WEBVIEW)
    }

    /// 设置文件（探针用：与 data.root 无关）。
    pub fn probe_settings_file() -> PathBuf {
        Self::local_root()
            .join(dir::CONFIG)
            .join(dir::SETTINGS_FILE)
    }

    /// 解析路径集；`settings_data_root` 为空时用默认数据根。
    pub fn resolve(settings_data_root: &str) -> Self {
        let local_root = Self::local_root();
        let config_dir = local_root.join(dir::CONFIG);
        let cache_dir = local_root.join(dir::CACHE);
        let data_root = if settings_data_root.trim().is_empty() {
            local_root.join(dir::DATA)
        } else {
            PathBuf::from(settings_data_root)
        };
        Self {
            local_root: local_root.clone(),
            install_dir: Self::install_dir(),
            data_root,
            config_dir: config_dir.clone(),
            settings_file: config_dir.join(dir::SETTINGS_FILE),
            logs_dir: local_root.join(dir::LOGS),
            cache_dir,
        }
    }

    /// 首次启动即铺好家园骨架，关于页「打开」不必等第一次落盘。
    pub fn ensure_home(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.config_dir)?;
        std::fs::create_dir_all(&self.cache_dir)?;
        std::fs::create_dir_all(&self.logs_dir)?;
        std::fs::create_dir_all(&self.data_root)?;
        Ok(())
    }

    pub fn adb_tools_dir(&self) -> PathBuf {
        self.data_root.join(dir::TOOLS).join(dir::ADB)
    }

    pub fn module_data(&self, module_id: &str) -> PathBuf {
        self.data_root.join(dir::MODULES).join(module_id)
    }

    pub fn library_file(&self) -> PathBuf {
        self.module_data(module_id::TERMINAL)
            .join(dir::LIBRARY_CONFIG)
            .join(dir::LIBRARY_FILE)
    }

    pub fn exports_dir(&self) -> PathBuf {
        self.module_data(module_id::LOGS).join(dir::EXPORTS)
    }

    pub fn drag_out_dir(&self) -> PathBuf {
        self.cache_dir.join(dir::DRAG_OUT)
    }

    pub fn webview_dir(&self) -> PathBuf {
        self.cache_dir.join(dir::WEBVIEW)
    }

    pub fn update_cache_dir(&self) -> PathBuf {
        self.cache_dir.join(dir::UPDATE)
    }

    pub fn devices_catalog_file(&self) -> PathBuf {
        self.config_dir.join(dir::DEVICES_CATALOG)
    }

    pub fn catalog(&self) -> AppPathCatalog {
        AppPathCatalog {
            local_root: path_string(&self.local_root),
            install_dir: path_string(&self.install_dir),
            config_dir: path_string(&self.config_dir),
            settings_file: path_string(&self.settings_file),
            logs_dir: path_string(&self.logs_dir),
            data_root: path_string(&self.data_root),
            cache_dir: path_string(&self.cache_dir),
            webview_dir: path_string(&self.webview_dir()),
            update_cache_dir: path_string(&self.update_cache_dir()),
            adb_tools_dir: path_string(&self.adb_tools_dir()),
            library_file: path_string(&self.library_file()),
            exports_dir: path_string(&self.exports_dir()),
            drag_out_dir: path_string(&self.drag_out_dir()),
        }
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_data_root_uses_local_default() {
        let p = AppPaths::resolve("");
        assert_eq!(p.data_root, AppPaths::local_root().join(dir::DATA));
        assert_eq!(p.logs_dir, AppPaths::default_logs_dir());
        assert_eq!(p.settings_file, AppPaths::probe_settings_file());
        assert_eq!(p.local_root, AppPaths::local_root());
        assert_eq!(p.config_dir, p.local_root.join(dir::CONFIG));
        assert_eq!(p.cache_dir, p.local_root.join(dir::CACHE));
        assert_eq!(p.install_dir, AppPaths::install_dir());
        #[cfg(windows)]
        assert_ne!(p.install_dir, p.local_root);
    }

    #[test]
    fn ensure_home_creates_config_cache_logs_and_data() {
        let root = std::env::temp_dir().join(format!(
            "yohu-paths-home-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let p = AppPaths {
            local_root: root.clone(),
            install_dir: root.join("Programs"),
            data_root: root.join(dir::DATA),
            config_dir: root.join(dir::CONFIG),
            settings_file: root.join(dir::CONFIG).join(dir::SETTINGS_FILE),
            logs_dir: root.join(dir::LOGS),
            cache_dir: root.join(dir::CACHE),
        };
        p.ensure_home().expect("ensure home");
        assert!(p.config_dir.is_dir());
        assert!(p.cache_dir.is_dir());
        assert!(p.logs_dir.is_dir());
        assert!(p.data_root.is_dir());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn custom_data_root_does_not_move_config_logs_or_cache() {
        let custom = PathBuf::from("D:\\YohuData");
        let p = AppPaths::resolve(custom.to_str().expect("utf-8"));
        assert_eq!(p.data_root, custom);
        assert_eq!(p.logs_dir, AppPaths::local_root().join(dir::LOGS));
        assert_eq!(p.config_dir, AppPaths::local_root().join(dir::CONFIG));
        assert_eq!(p.cache_dir, AppPaths::local_root().join(dir::CACHE));
        assert_eq!(p.settings_file, AppPaths::probe_settings_file());
        assert_eq!(p.drag_out_dir(), p.cache_dir.join(dir::DRAG_OUT));
    }

    #[test]
    fn module_layout_matches_architecture() {
        let p = AppPaths::resolve(r"X:\data");
        let root = PathBuf::from(r"X:\data");
        assert_eq!(
            p.library_file(),
            root.join(dir::MODULES)
                .join(module_id::TERMINAL)
                .join(dir::LIBRARY_CONFIG)
                .join(dir::LIBRARY_FILE)
        );
        assert_eq!(
            p.exports_dir(),
            root.join(dir::MODULES)
                .join(module_id::LOGS)
                .join(dir::EXPORTS)
        );
        assert_eq!(p.adb_tools_dir(), root.join(dir::TOOLS).join(dir::ADB));
        assert_eq!(
            p.devices_catalog_file(),
            AppPaths::local_root()
                .join(dir::CONFIG)
                .join(dir::DEVICES_CATALOG)
        );
    }

    #[test]
    fn catalog_strings_are_absolute_or_custom() {
        let p = AppPaths::resolve("");
        let c = p.catalog();
        assert_eq!(c.data_root, path_string(&p.data_root));
        assert_eq!(c.library_file, path_string(&p.library_file()));
        assert_eq!(c.config_dir, path_string(&p.config_dir));
        assert_eq!(c.cache_dir, path_string(&p.cache_dir));
        assert_eq!(c.install_dir, path_string(&p.install_dir));
        assert!(c.settings_file.ends_with(dir::SETTINGS_FILE));
        assert!(c.drag_out_dir.ends_with(dir::DRAG_OUT));
        assert!(c.webview_dir.ends_with(dir::WEBVIEW));
    }
}
