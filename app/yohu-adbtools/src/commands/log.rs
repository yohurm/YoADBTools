//! 日志模块命令：薄转发 CaptureService。

use std::path::PathBuf;

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_logsrv::LogError;
use yohu_protocol::{
    CaptureStart, CaptureStatus, ExportRequest, ExportResult, IpcError, IpcErrorCode, LogBatch,
    ProcessEntry, ReplayRequest,
};

#[tauri::command(rename = "log.capture.start")]
pub async fn log_capture_start(
    state: State<'_, AppState>,
    serial: String,
) -> Result<CaptureStart, IpcError> {
    tracing::info!(serial = %serial, "log.capture.start");
    state.require_online(&serial)?;
    let snap = state.settings.snapshot();
    state.capture.set_ring_capacity(snap.buffer_capacity);
    let clear = snap.clear_device_on_start;
    let result = match state.capture.start(&serial, clear).await {
        Ok(result) => result,
        Err(LogError::Cancelled) => {
            return Err(ipc_code(IpcErrorCode::Cancelled, "采集已取消"));
        }
        Err(e) => return Err(ipc(e)),
    };

    if !result.adopted {
        let task_id = state
            .tasks
            .register(format!("logcat 采集: {serial}"), format!("设备 {serial}"));
        state
            .capture_tasks
            .lock()
            .expect("capture lock poisoned")
            .insert(serial, task_id);
    }
    Ok(result)
}

#[tauri::command(rename = "log.capture.stop")]
pub async fn log_capture_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.stop(&serial).await;
    state.finish_capture_task(&serial);
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
        .map_err(ipc)
}

#[tauri::command(rename = "log.replay")]
pub fn log_replay(state: State<'_, AppState>, req: ReplayRequest) -> Result<LogBatch, IpcError> {
    Ok(state.capture.replay(req))
}

/// `log.export`：当前窗口过滤条件下的环快照。
#[tauri::command(rename = "log.export")]
pub fn log_export(
    state: State<'_, AppState>,
    req: ExportRequest,
) -> Result<ExportResult, IpcError> {
    let settings = state.settings.snapshot();
    let default_dir = if !settings.export_default_path.is_empty() {
        PathBuf::from(&settings.export_default_path)
    } else {
        state.paths.exports_dir()
    };
    let result = state
        .capture
        .export(
            &req.serial,
            req.from_seq,
            &req.filter,
            req.path.as_deref().map(std::path::Path::new),
            Some(default_dir.as_path()),
        )
        .map_err(ipc)?;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

#[tauri::command(rename = "log.processSnapshot")]
pub async fn log_process_snapshot(
    state: State<'_, AppState>,
    serial: String,
) -> Result<Vec<ProcessEntry>, IpcError> {
    state.capture.process_snapshot(&serial).await.map_err(ipc)
}
