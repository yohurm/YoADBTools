//! 文件模块命令：浏览/传输/取消/删除/新建。薄转发。

use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_dnd, ipc_file};
use crate::state::AppState;
use yohu_protocol::{
    Direction, DragOutRequest, IpcError, PathOpRequest, RemoteEntry, TransferRequest,
};

#[tauri::command(rename = "files.list")]
pub async fn files_list(
    state: State<'_, AppState>,
    serial: String,
    path: String,
) -> Result<Vec<RemoteEntry>, IpcError> {
    state.require_online(&serial)?;
    crate::browse_runs::list(&state, &serial, &path)
        .await
        .map_err(ipc_file)
}

#[tauri::command(rename = "files.push")]
pub async fn files_push(
    state: State<'_, AppState>,
    app: AppHandle,
    req: TransferRequest,
) -> Result<u32, IpcError> {
    state.require_online(&req.serial)?;
    Ok(crate::transfer_runs::spawn(app, req, Direction::Push))
}

#[tauri::command(rename = "files.pull")]
pub async fn files_pull(
    state: State<'_, AppState>,
    app: AppHandle,
    req: TransferRequest,
) -> Result<u32, IpcError> {
    state.require_online(&req.serial)?;
    Ok(crate::transfer_runs::spawn(app, req, Direction::Pull))
}

#[tauri::command(rename = "files.cancel")]
pub fn files_cancel(state: State<'_, AppState>, id: u32) -> Result<(), IpcError> {
    crate::transfer_runs::cancel(&state, id);
    Ok(())
}

#[tauri::command(rename = "files.delete")]
pub async fn files_delete(state: State<'_, AppState>, req: PathOpRequest) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .delete(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(ipc_file)
}

#[tauri::command(rename = "files.mkdir")]
pub async fn files_mkdir(state: State<'_, AppState>, req: PathOpRequest) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .mkdir(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(ipc_file)
}

#[tauri::command(rename = "files.create")]
pub async fn files_create(state: State<'_, AppState>, req: PathOpRequest) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .create_file(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(ipc_file)
}

#[tauri::command(rename = "files.dragOut")]
pub async fn files_drag_out(
    state: State<'_, AppState>,
    app: AppHandle,
    req: DragOutRequest,
) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    crate::dnd::drag_out(&app, &state, req)
        .await
        .map_err(ipc_dnd)
}
