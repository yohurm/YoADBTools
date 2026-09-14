//! 应用更新：薄转发 `update_runs`。

use tauri::{AppHandle, State};

use crate::commands::ipc_update;
use crate::state::AppState;
use yohu_protocol::{
    IpcError, RemoteUpdate, UpdateChannelInfo, UpdateDownloadRequest, UpdateDownloadResult,
};

#[tauri::command(rename = "update.check")]
pub async fn update_check(state: State<'_, AppState>) -> Result<RemoteUpdate, IpcError> {
    crate::update_runs::check(&state).await.map_err(ipc_update)
}

#[tauri::command(rename = "update.info")]
pub fn update_info(state: State<'_, AppState>) -> Result<UpdateChannelInfo, IpcError> {
    crate::update_runs::info(&state).map_err(ipc_update)
}

#[tauri::command(rename = "update.download")]
pub async fn update_download(
    state: State<'_, AppState>,
    request: UpdateDownloadRequest,
) -> Result<UpdateDownloadResult, IpcError> {
    crate::update_runs::download(&state, request)
        .await
        .map_err(ipc_update)
}

#[tauri::command(rename = "update.install")]
pub fn update_install(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), IpcError> {
    crate::update_runs::install(&app, &state, &path).map_err(ipc_update)
}

#[tauri::command(rename = "update.cancel")]
pub fn update_cancel(state: State<'_, AppState>) -> Result<(), IpcError> {
    crate::update_runs::cancel(&state);
    Ok(())
}

#[tauri::command(rename = "update.open")]
pub fn update_open(url: String) -> Result<(), IpcError> {
    crate::update_runs::open(&url).map_err(ipc_update)
}
