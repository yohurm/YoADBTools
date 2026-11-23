//! 日志模块命令：薄转发 CaptureService / capture_runs。
//! 只做在线校验 + 转发；错误分类与用户文案在 `ipc_map`。
//!
//! **鉴权矩阵（本层声明，不由读者从代码推断）**
//!
//! | 命令 | 在线要求 | 理由 |
//! |---|---|---|
//! | `log.capture.start` | 必须在线 | 新流要对设备起 `logcat` 子进程 |
//! | `log.clearDevice` | 必须在线 | 要发 `logcat -c` |
//! | `log.processSnapshot` | 必须在线 | 要跑 `ps` |
//! | `log.packageSnapshot` | 必须在线 | 要跑 `pm list packages` |
//! | `log.capture.stop` | 离线可用 | 掉线也必须能收口（收口是本层职责） |
//! | `log.capture.status` | 离线可用 | 对账入口，掉线后 UI 仍需读世代 |
//! | `log.range` | 离线可用 | 纯内存环读取（列式二进制帧，ADR-v6-049），不碰设备 |
//! | `log.export` | 离线可用 | 导出的是本机环快照，不碰设备 |
//! | `log.clear` | 离线可用 | 诊断入口：只清本机环与窗口索引，不发 `logcat -c` |
//!
//! `log.clear` 保留为**诊断/对账入口**：无 UI 调用方，清设备缓冲走 `log.clearDevice`。

use tauri::State;

use crate::commands::{ipc_adb, ipc_log, ipc_session};
use crate::state::AppState;
use yohu_protocol::{
    CaptureStart, CaptureStatus, ExportRequest, ExportResult, IpcError, LogRangeRequest,
    ProcessEntry,
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

/// 诊断/对账入口（无 UI 调用方）：只清本机环与窗口索引，不发 `logcat -c`。
#[tauri::command(rename = "log.clear")]
pub fn log_clear(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.clear(&serial);
    Ok(())
}

#[tauri::command(rename = "log.clearDevice")]
pub async fn log_clear_device(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.require_online(&serial).map_err(ipc_session)?;
    state
        .capture
        .clear_device_buffer(&serial)
        .await
        .map_err(ipc_log)
}

/// 从设备环按 seq 取原始行（UI 游标实时拉取）。纯内存读，离线可用。
///
/// **列式二进制帧（ADR-v6-049 数据面优化 / P0-3）**：返回 `tauri::ipc::Response`（原始字节
/// → JS `ArrayBuffer`），前端 `@yohu/api` 的 `decodeLogRange` 按同一布局解码；每行不再重复
/// 字段名、不做 JSON 语法解析。编码逻辑在 `yohu-logsrv::ring::encode_rows`。
///
/// **异步 + 阻塞线程池**：快照切片 + 列式编码不能在 Tauri 主线程做，
/// 否则高频拉取会把 UI 事件循环压死（“开发窗口卡死”的架构根因之一）。
#[tauri::command(rename = "log.range")]
pub async fn log_range(
    state: State<'_, AppState>,
    req: LogRangeRequest,
) -> Result<tauri::ipc::Response, IpcError> {
    let capture = std::sync::Arc::clone(&state.capture);
    let serial = req.serial;
    let from_seq = req.from_seq;
    let limit = req.limit as usize;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        capture.range_bytes(&serial, from_seq, limit)
    })
    .await
    .unwrap_or_default();
    Ok(tauri::ipc::Response::new(bytes))
}

/// 导出环快照。`ExportResult.lines` 是过滤后实际写出的条数，原样回给调用方提示。
#[tauri::command(rename = "log.export")]
pub async fn log_export(
    state: State<'_, AppState>,
    req: ExportRequest,
) -> Result<ExportResult, IpcError> {
    crate::capture_runs::export(&state, req)
        .await
        .map_err(ipc_log)
}

#[tauri::command(rename = "log.processSnapshot")]
pub async fn log_process_snapshot(
    state: State<'_, AppState>,
    serial: String,
) -> Result<Vec<ProcessEntry>, IpcError> {
    state.require_online(&serial).map_err(ipc_session)?;
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
    state.require_online(&serial).map_err(ipc_session)?;
    state
        .client
        .list_packages(&serial, state.root_cancel.child_token())
        .await
        .map_err(|e| ipc_adb(&e))
}
