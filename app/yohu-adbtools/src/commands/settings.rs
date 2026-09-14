//! 设置命令：薄转发 `settings_apply`。

use tauri::State;

use crate::commands::ipc_code;
use crate::state::AppState;
use yohu_protocol::{AppSettings, IpcError, IpcErrorCode, SettingKey};

#[tauri::command(rename = "settings.set")]
pub async fn settings_set(
    state: State<'_, AppState>,
    key: SettingKey,
    value: serde_json::Value,
) -> Result<AppSettings, IpcError> {
    crate::settings_apply::set(&state, key, &value)
        .await
        .map_err(|e| ipc_code(IpcErrorCode::InvalidArgs, e))
}
