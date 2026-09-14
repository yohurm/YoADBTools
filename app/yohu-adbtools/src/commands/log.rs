//! 日志模块命令：薄转发 CaptureService / capture_runs。

use tauri::State;

use crate::commands::ipc_log;
use crate::state::AppState;
use yohu_protocol::{
    CaptureStart, CaptureStatus, ExportRequest, ExportResult, IpcError, LogBatch, ProcessEntry,
    ReplayRequest,
};

#[tauri::command(rename = "log.capture.start")]
pub async fn log_capture_start(
    state: State<'_, AppState>,
    serial: String,
) -> Result<CaptureStart, IpcError> {
    state.require_online(&serial)?;
    crate::capture_runs::start(&state, &serial)
        .await
        .map_err(ipc_log)
}

#[tauri::command(rename = "log.capture.stop")]
pub async fn log_capture_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.stop(&serial).await;
    Ok(())
}

#[tauri::command(rename = "log.capture.status")]
pub fn log_capture_status(state: State<'_, AppState>, serial: String) -> CaptureStatus {
    state.capture.status(&serial)
}

#[tauri::command(rename = "log.clear")]
pub fn log_clear(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.clear(&serial);
    Ok(())
}

#[tauri::command(rename = "log.clearDevice")]
pub async fn log_clear_device(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state
        .capture
        .clear_device_buffer(&serial)
        .await
        .map_err(ipc_log)
}

#[tauri::command(rename = "log.replay")]
pub fn log_replay(state: State<'_, AppState>, req: ReplayRequest) -> Result<LogBatch, IpcError> {
    Ok(state.capture.replay(req))
}

#[tauri::command(rename = "log.export")]
pub fn log_export(
    state: State<'_, AppState>,
    req: ExportRequest,
) -> Result<ExportResult, IpcError> {
    crate::capture_runs::export(&state, req).map_err(ipc_log)
}

#[tauri::command(rename = "log.processSnapshot")]
pub async fn log_process_snapshot(
    state: State<'_, AppState>,
    serial: String,
) -> Result<Vec<ProcessEntry>, IpcError> {
    state
        .capture
        .process_snapshot(&serial)
        .await
        .map_err(ipc_log)
}

#[tauri::command(rename = "log.packageSnapshot")]
pub async fn log_package_snapshot(
    state: State<'_, AppState>,
    serial: String,
) -> Result<Vec<String>, IpcError> {
    state
        .capture
        .package_snapshot(&serial)
        .await
        .map_err(ipc_log)
}
