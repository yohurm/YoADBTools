//! 设置立即生效：环容量、ADB 路径、`settings/changed`。commands 只反序列化并转发。

use std::path::PathBuf;

use crate::settings_store::SettingsStoreError;
use crate::state::AppState;
use yohu_protocol::{AppEvent, AppSettings, SettingKey};

/// 设置里的 adb 路径。空串是自动解析，交给 `ToolResolver`。
pub fn user_adb_path(adb_path: &str) -> Option<PathBuf> {
    if adb_path.is_empty() {
        None
    } else {
        Some(PathBuf::from(adb_path))
    }
}

pub async fn set(
    state: &AppState,
    key: SettingKey,
    value: &serde_json::Value,
) -> Result<AppSettings, SettingsStoreError> {
    let updated = state.settings.set(key, value)?;

    if key == SettingKey::BufferCapacity {
        state.capture.set_ring_capacity(updated.buffer_capacity);
    }

    if key == SettingKey::MirrorOpenh264 {
        if !updated.mirror_openh264 {
            if let Some(token) = state.openh264_acquire.lock().await.take() {
                token.cancel();
            }
        }
        #[cfg(target_os = "linux")]
        state.present.set_openh264_enabled(updated.mirror_openh264);
    }

    if key == SettingKey::AdbPath {
        let path = user_adb_path(&updated.adb_path);
        state.app_log.info(if path.is_none() {
            "ADB 路径已重置为自动解析".to_string()
        } else {
            format!("ADB 路径已切换: {}", updated.adb_path)
        });
        state.client.set_user_path(path);
        crate::browse_runs::reset_transport(state).await;
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
