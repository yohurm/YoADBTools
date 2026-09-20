//! 命令库命令：加载/保存转发。

use tauri::State;

use crate::commands::ipc_library_store;
use crate::state::AppState;
use yohu_protocol::{CommandLibraryDto, IpcError};

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
