//! 设置立即生效：环容量、ADB 路径、`settings/changed`。commands 只反序列化并转发。

use std::path::PathBuf;

use crate::state::AppState;
use yohu_protocol::{AppEvent, AppSettings, SettingKey};

pub async fn set(
    state: &AppState,
    key: SettingKey,
    value: &serde_json::Value,
) -> Result<AppSettings, String> {
    let updated = state.settings.set(key, value)?;

    if key == SettingKey::BufferCapacity {
        state.capture.set_ring_capacity(updated.buffer_capacity);
    }

    if key == SettingKey::AdbPath {
        let path = (!updated.adb_path.is_empty()).then(|| PathBuf::from(&updated.adb_path));
        state.client.set_user_path(path);
        state.app_log.info(if updated.adb_path.is_empty() {
            "ADB 路径已重置为自动解析".to_string()
        } else {
            format!("ADB 路径已切换: {}", updated.adb_path)
        });
    }

    let _ = state
        .event_tx
        .send(AppEvent::SettingsChanged {
            key: key.as_str().to_string(),
            settings: updated.clone(),
        })
        .await;
    Ok(updated)
}
