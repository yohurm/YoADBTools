//! 设置存储：JSON + 原子写（临时文件 + rename）。校验在 yohu-domain。

use std::io;
use std::path::PathBuf;
use std::sync::RwLock;

use yohu_domain::apply_setting;
use yohu_protocol::{AppSettings, SettingKey};
use yohu_runtime::{atomic_write, backup_corrupt};

/// 文件设置存储。
pub struct SettingsStore {
    file: PathBuf,
    inner: RwLock<AppSettings>,
}

impl SettingsStore {
    /// 缺失 → 默认；损坏 JSON → 备份后默认。其它读失败必须 `Err`，禁止当 default。
    pub fn load(file: PathBuf) -> io::Result<Self> {
        let settings = match std::fs::read_to_string(&file) {
            Ok(text) => match serde_json::from_str::<AppSettings>(&text) {
                Ok(s) => s,
                Err(_) => {
                    let _ = backup_corrupt(&file, &text);
                    AppSettings::default()
                }
            },
            Err(e) if e.kind() == io::ErrorKind::NotFound => AppSettings::default(),
            Err(e) => return Err(e),
        };
        Ok(Self {
            file,
            inner: RwLock::new(settings),
        })
    }

    pub fn snapshot(&self) -> AppSettings {
        self.inner.read().expect("settings lock poisoned").clone()
    }

    pub fn set(&self, key: SettingKey, value: &serde_json::Value) -> Result<AppSettings, String> {
        let mut s = self.snapshot();
        apply_setting(&mut s, key, value).map_err(|e| e.to_string())?;
        *self.inner.write().expect("settings lock poisoned") = s.clone();
        self.save_atomic()?;
        Ok(s)
    }

    pub fn save_atomic(&self) -> Result<(), String> {
        let snapshot = self.snapshot();
        let text = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
        atomic_write(&self.file, text).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_loads_default() {
        let path = std::env::temp_dir().join("yohu-settings-missing-surely-not-there.json");
        let _ = std::fs::remove_file(&path);
        let store = SettingsStore::load(path).expect("NotFound 是默认");
        assert_eq!(store.snapshot(), AppSettings::default());
    }

    #[cfg(windows)]
    #[test]
    fn locked_file_is_err_not_default() {
        use std::os::windows::fs::OpenOptionsExt;
        let path =
            std::env::temp_dir().join(format!("yohu-settings-locked-{}.json", std::process::id()));
        let _guard = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .share_mode(0)
            .open(&path)
            .expect("lock settings file");
        let err = match SettingsStore::load(path.clone()) {
            Ok(_) => panic!("共享冲突不得回落 default"),
            Err(e) => e,
        };
        assert_ne!(err.kind(), io::ErrorKind::NotFound);
        drop(_guard);
        let _ = std::fs::remove_file(path);
    }
}
