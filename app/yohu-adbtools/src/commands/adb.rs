//! 通用 adb 执行命令（终端自由命令用）。

use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_adb, ipc_session};
use crate::state::AppState;
use yohu_protocol::{AdbExecRequest, ExecOutcome, IpcError};

/// `adb.exec`：短命令，返回原始结果。
#[tauri::command(rename = "adb.exec")]
pub async fn adb_exec(
    state: State<'_, AppState>,
    req: AdbExecRequest,
) -> Result<ExecOutcome, IpcError> {
    state.require_online(&req.serial).map_err(ipc_session)?;
    state
        .client
        .run(
            &req.serial,
            &req.argv,
            req.timeout_ms,
            CancellationToken::new(),
        )
        .await
        .map_err(|err| ipc_adb(&err))
}
