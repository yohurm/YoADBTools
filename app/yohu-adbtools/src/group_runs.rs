//! 命令组 / 命令块运行生命周期：任务中心登记、进度转发、取消。编排在 domain GroupExecutor。

use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_code, ipc_library};
use crate::state::AppState;
use yohu_domain::{GroupExecutor, LibraryError, ScheduledStep};
use yohu_protocol::{
    AppEvent, BlockRunRequest, GroupProgress, GroupRunRequest, IpcError, IpcErrorCode,
};

/// 查库、校验占位符、登记并异步跑一组条目；立即返回 run_id。
pub fn start(app: AppHandle, state: &AppState, req: GroupRunRequest) -> Result<u32, IpcError> {
    let group = {
        let library = state.library.lock().expect("library lock poisoned");
        library.group(&req.group_id).cloned().ok_or_else(|| {
            ipc_code(
                IpcErrorCode::NotFound,
                format!("命令组不存在: {}", req.group_id),
            )
        })?
    };
    if let Some(entry) = group.first_entry_needing_values() {
        return Err(ipc_library(LibraryError::GroupNeedsValues {
            group_id: group.id.clone(),
            entry_id: entry.id().to_string(),
        }));
    }
    let steps = group.scheduled_steps();
    Ok(spawn(
        app,
        state,
        format!("命令组: {}", group.name),
        format!("{} 台设备 · {} 条命令", req.serials.len(), steps.len()),
        steps,
        req.serials,
    ))
}

/// 查库、填充、登记并异步跑一个命令块。
pub fn start_block(app: AppHandle, state: &AppState, req: BlockRunRequest) -> Result<u32, IpcError> {
    let block = {
        let library = state.library.lock().expect("library lock poisoned");
        library.block(&req.block_id).cloned().ok_or_else(|| {
            ipc_code(
                IpcErrorCode::NotFound,
                format!("命令块不存在: {}", req.block_id),
            )
        })?
    };
    let filled = block.fill(&req.values).map_err(ipc_library)?;
    let steps = filled.scheduled_steps();
    Ok(spawn(
        app,
        state,
        format!("命令块: {}", block.name),
        format!("{} 台设备 · {} 条命令", req.serials.len(), steps.len()),
        steps,
        req.serials,
    ))
}

fn spawn(
    app: AppHandle,
    state: &AppState,
    task_name: String,
    detail: String,
    steps: Vec<ScheduledStep>,
    serials: Vec<String>,
) -> u32 {
    let run_id = state
        .group_next
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        + 1;
    let cancel = CancellationToken::new();
    state
        .group_runs
        .lock()
        .expect("group lock poisoned")
        .insert(run_id, cancel.clone());

    let task_id = state.tasks.register(task_name, detail);
    let (tx, mut rx) = mpsc::channel::<yohu_domain::GroupRunEvent>(64);
    let sink = state.event_tx.clone();

    tokio::spawn(async move {
        let forward = tokio::spawn(async move {
            while let Some(e) = rx.recv().await {
                let _ = sink.try_send(AppEvent::GroupProgress(GroupProgress {
                    run_id,
                    serial: e.serial,
                    name: Some(e.name),
                    template: e.template,
                    ok: e.exit_code == 0,
                    message: if e.message.is_empty() {
                        None
                    } else {
                        Some(e.message)
                    },
                    duration_ms: e.duration_ms,
                }));
            }
        });

        let executor = GroupExecutor::new({
            let state = app.state::<AppState>();
            state.client.clone()
        });
        executor.run(&steps, &serials, tx, cancel).await;
        let _ = forward.await;

        let state = app.state::<AppState>();
        state
            .group_runs
            .lock()
            .expect("group lock poisoned")
            .remove(&run_id);
        state.tasks.finish(task_id);
    });

    run_id
}

pub fn cancel(state: &AppState, run_id: u32) -> Result<(), IpcError> {
    let token = state
        .group_runs
        .lock()
        .expect("group lock poisoned")
        .get(&run_id)
        .cloned();
    match token {
        Some(c) => {
            c.cancel();
            Ok(())
        }
        None => Err(ipc_code(
            IpcErrorCode::NotFound,
            format!("运行不存在: {run_id}"),
        )),
    }
}
