//! 投屏模块命令：薄转发 Present / MirrorService。

use tauri::State;

use crate::commands::{ipc_mirror, ipc_present};
use crate::state::AppState;
use yohu_protocol::{
    IpcError, MirrorInjectRequest, MirrorLayout, MirrorScreenshotRequest, MirrorStart,
    MirrorStartRequest,
};

#[tauri::command(rename = "mirror.start")]
pub async fn mirror_start(
    state: State<'_, AppState>,
    req: MirrorStartRequest,
) -> Result<MirrorStart, IpcError> {
    state.require_online(&req.serial)?;
    crate::mirror_sessions::start(&state, req)
        .await
        .map_err(ipc_mirror)
}

#[tauri::command(rename = "mirror.stop")]
pub async fn mirror_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    tracing::info!(serial = %serial, "mirror.stop");
    state.mirror.stop(&serial).await;
    Ok(())
}

#[tauri::command(rename = "mirror.inject")]
pub async fn mirror_inject(
    state: State<'_, AppState>,
    req: MirrorInjectRequest,
) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mirror
        .inject(&req.serial, req.message)
        .await
        .map_err(ipc_mirror)
}

#[tauri::command(rename = "mirror.closeControl")]
pub fn mirror_close_control(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.mirror.close_control(&serial).map_err(ipc_mirror)
}

#[tauri::command(rename = "mirror.present.setActive")]
pub fn mirror_present_set_active(state: State<'_, AppState>, active: bool) -> Result<(), IpcError> {
    state.present.set_active(active);
    Ok(())
}

#[tauri::command(rename = "mirror.layout")]
pub async fn mirror_layout(state: State<'_, AppState>, req: MirrorLayout) -> Result<(), IpcError> {
    state.present.layout(req);
    Ok(())
}

#[tauri::command(rename = "mirror.screenshot")]
pub fn mirror_screenshot(
    state: State<'_, AppState>,
    req: MirrorScreenshotRequest,
) -> Result<(), IpcError> {
    crate::mirror_sessions::screenshot(&state, &req.serial, &req.path).map_err(ipc_present)
}
