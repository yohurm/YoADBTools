//! 命令组 / 命令块运行生命周期：任务中心登记、进度转发、取消。编排在 domain GroupExecutor。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::limits::GROUP_EVENT_CHANNEL_CAP;
use crate::state::AppState;
use yohu_domain::{GroupExecutor, LibraryError, ScheduledStep};
use yohu_protocol::{AppEvent, BlockRunRequest, GroupProgress, GroupRunRequest};

#[derive(Clone)]
pub struct GroupRuns {
    cancels: Arc<Mutex<HashMap<u32, CancellationToken>>>,
    next: Arc<AtomicU32>,
}

impl GroupRuns {
    pub fn new() -> Self {
        Self {
            cancels: Arc::new(Mutex::new(HashMap::new())),
            next: Arc::new(AtomicU32::new(0)),
        }
    }

    pub fn allocate(&self) -> (u32, CancellationToken) {
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let cancel = CancellationToken::new();
        self.cancels
            .lock()
            .expect("group lock poisoned")
            .insert(id, cancel.clone());
        (id, cancel)
    }

    pub fn release(&self, id: u32) {
        self.cancels
            .lock()
            .expect("group lock poisoned")
            .remove(&id);
    }

    pub fn cancel(&self, id: u32) -> bool {
        if let Some(cancel) = self
            .cancels
            .lock()
            .expect("group lock poisoned")
            .get(&id)
            .cloned()
        {
            cancel.cancel();
            true
        } else {
            false
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GroupRunError {
    #[error("命令组不存在: {0}")]
    GroupNotFound(String),
    #[error("命令块不存在: {0}")]
    BlockNotFound(String),
    #[error("运行不存在: {0}")]
    RunNotFound(u32),
    #[error("{0}")]
    Library(#[from] LibraryError),
}

/// 查库、校验占位符、登记并异步跑一组条目；立即返回 run_id。
pub fn start(app: AppHandle, state: &AppState, req: GroupRunRequest) -> Result<u32, GroupRunError> {
    let group = {
        let library = state.library.lock().expect("library lock poisoned");
        library
            .group(&req.group_id)
            .cloned()
            .ok_or_else(|| GroupRunError::GroupNotFound(req.group_id.clone()))?
    };
    if let Some(entry) = group.first_entry_needing_values() {
        return Err(LibraryError::GroupNeedsValues {
            group_id: group.id.clone(),
            entry_id: entry.id().to_string(),
        }
        .into());
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
pub fn start_block(
    app: AppHandle,
    state: &AppState,
    req: BlockRunRequest,
) -> Result<u32, GroupRunError> {
    let block = {
        let library = state.library.lock().expect("library lock poisoned");
        library
            .block(&req.block_id)
            .cloned()
            .ok_or_else(|| GroupRunError::BlockNotFound(req.block_id.clone()))?
    };
    let filled = block.fill(&req.values)?;
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
    let (run_id, cancel) = state.group_runs.allocate();

    let task_id = state.tasks.register(task_name, detail);
    let (tx, mut rx) = mpsc::channel::<yohu_domain::GroupRunEvent>(GROUP_EVENT_CHANNEL_CAP);
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
        state.group_runs.release(run_id);
        state.tasks.finish(task_id);
    });

    run_id
}

pub fn cancel(state: &AppState, run_id: u32) -> Result<(), GroupRunError> {
    if state.group_runs.cancel(run_id) {
        Ok(())
    } else {
        Err(GroupRunError::RunNotFound(run_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_event_channel_cap_is_named() {
        assert_eq!(GROUP_EVENT_CHANNEL_CAP, 64);
    }

    #[test]
    fn allocate_ids_are_monotonic() {
        let runs = GroupRuns::new();
        let (a, _) = runs.allocate();
        let (b, _) = runs.allocate();
        assert_eq!(a, 1);
        assert_eq!(b, 2);
    }

    #[test]
    fn cancel_unknown_is_false() {
        assert!(!GroupRuns::new().cancel(1));
    }

    #[test]
    fn cancel_live_run_marks_token() {
        let runs = GroupRuns::new();
        let (id, token) = runs.allocate();
        assert!(runs.cancel(id));
        assert!(token.is_cancelled());
    }

    #[test]
    fn release_drops_cancel_slot() {
        let runs = GroupRuns::new();
        let (id, token) = runs.allocate();
        runs.release(id);
        assert!(!runs.cancel(id));
        assert!(!token.is_cancelled());
    }
}
