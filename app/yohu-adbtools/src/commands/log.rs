//! 日志模块命令：薄转发 CaptureService / capture_runs。

use tauri::State;

use crate::commands::{ipc_log, ipc_session};
use crate::state::AppState;
use yohu_protocol::{
    CaptureStart, CaptureStatus, ExportRequest, ExportResult, IpcError, IpcErrorCode, LogBatch,
    LogLatch, LogPage, LogPageQuery, LogWindowBind, ProcessEntry, ReplayRequest,
};

#[tauri::command(rename = "log.capture.start")]
pub async fn log_capture_start(
    state: State<'_, AppState>,
    serial: String,
) -> Result<CaptureStart, IpcError> {
    state.require_online(&serial).map_err(ipc_session)?;
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

#[tauri::command(rename = "log.window.bind")]
pub fn log_window_bind(state: State<'_, AppState>, spec: LogWindowBind) -> LogPage {
    state.capture.bind_window(spec)
}

#[tauri::command(rename = "log.window.release")]
pub fn log_window_release(state: State<'_, AppState>, id: u64) {
    state.capture.release_window(id);
}

#[tauri::command(rename = "log.window.latch")]
pub fn log_window_latch(state: State<'_, AppState>, latch: LogLatch) -> Result<LogPage, IpcError> {
    state.capture.latch_window(latch).ok_or_else(|| IpcError {
        code: IpcErrorCode::NotFound,
        message: "日志窗口未登记".into(),
    })
}

#[tauri::command(rename = "log.page")]
pub fn log_page(state: State<'_, AppState>, query: LogPageQuery) -> Result<LogPage, IpcError> {
    state.capture.page(query).ok_or_else(|| IpcError {
        code: IpcErrorCode::NotFound,
        message: "日志窗口未登记".into(),
    })
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
