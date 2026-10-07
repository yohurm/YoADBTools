//! 命令库命令：加载/保存/导入转发。

use tauri::State;

use crate::commands::ipc_library_store;
use crate::state::AppState;
use yohu_protocol::{CommandLibraryDto, ImportPreviewDto, IpcError};

/// `commandlib.load`：缺失 → 默认库；当前 schema 采纳；其余 schema / 损坏 → 备份后写默认库。
#[tauri::command(rename = "commandlib.load")]
pub fn commandlib_load(state: State<'_, AppState>) -> Result<CommandLibraryDto, IpcError> {
    crate::library_store::load(&state).map_err(ipc_library_store)
}

/// `commandlib.save`：全量提交。取消零污染由 UI 深拷贝保证。
#[tauri::command(rename = "commandlib.save")]
pub fn commandlib_save(state: State<'_, AppState>, dto: CommandLibraryDto) -> Result<(), IpcError> {
    crate::library_store::save(&state, dto).map_err(ipc_library_store)
}

/// `commandlib.preview`：读拖入文件，对照内存库。不写盘。
#[tauri::command(rename = "commandlib.preview")]
pub fn commandlib_preview(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<ImportPreviewDto, IpcError> {
    crate::library_store::preview(&state, &paths).map_err(ipc_library_store)
}

/// `commandlib.apply`：重读文件，按条目 id 合并后原子提交。
#[tauri::command(rename = "commandlib.apply")]
pub fn commandlib_apply(
    state: State<'_, AppState>,
    paths: Vec<String>,
    entry_ids: Vec<String>,
) -> Result<CommandLibraryDto, IpcError> {
    crate::library_store::apply(&state, &paths, &entry_ids).map_err(ipc_library_store)
}
