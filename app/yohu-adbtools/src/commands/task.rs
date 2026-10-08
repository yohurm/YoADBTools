//! 任务当前列表。与 `task/summary` 同一结构。

use tauri::State;

use crate::state::AppState;
use yohu_protocol::{IpcError, TaskInfo};

#[tauri::command(rename = "task.list")]
pub fn task_list(state: State<'_, AppState>) -> Result<Vec<TaskInfo>, IpcError> {
    Ok(state.tasks.summary())
}
