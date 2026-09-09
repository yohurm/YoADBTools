//! 终端域命令：单命令执行 / 自定义命令行 / 命令组编排（薄转发）。

use tauri::{AppHandle, State};

use crate::state::AppState;
use yohu_protocol::{
    GroupRunRequest, IpcError, SerialEvalResult, TerminalEvalRequest, TerminalExecRequest,
};

/// `terminal.eval`：按命令库 id 填充占位符，对 serials 并行执行。
#[tauri::command(rename = "terminal.eval")]
pub async fn terminal_eval(
    state: State<'_, AppState>,
    req: TerminalEvalRequest,
) -> Result<Vec<SerialEvalResult>, IpcError> {
    state.require_online_many(&req.serials)?;
    crate::terminal_eval::eval(&state, req).await
}

/// `terminal.exec`：自定义命令行，对 serials 并行执行。
#[tauri::command(rename = "terminal.exec")]
pub async fn terminal_exec(
    state: State<'_, AppState>,
    req: TerminalExecRequest,
) -> Result<Vec<SerialEvalResult>, IpcError> {
    state.require_online_many(&req.serials)?;
    crate::terminal_eval::exec(&state, req).await
}

/// `group.run`：命令组编排（多设备并行 / 组内串行，跑完全部命令）。
#[tauri::command(rename = "group.run")]
pub fn group_run(
    state: State<'_, AppState>,
    app: AppHandle,
    req: GroupRunRequest,
) -> Result<u32, IpcError> {
    state.require_online_many(&req.serials)?;
    crate::group_runs::start(app, &state, req)
}

/// `group.cancel`：取消命令组运行。
#[tauri::command(rename = "group.cancel")]
pub fn group_cancel(state: State<'_, AppState>, run_id: u32) -> Result<(), IpcError> {
    crate::group_runs::cancel(&state, run_id)
}
