//! 文件传输运行：id / 取消令牌 / 任务中心。commands 只校验在线并转发。
//!
//! 寿命入口只有 [`run`]（发号后可 `.await` / `block_on`）。[`spawn`] 只 `tokio::spawn` 这一层。

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::state::AppState;
use yohu_files::FileError;
use yohu_protocol::{Direction, TransferRequest};

#[derive(Clone)]
pub struct TransferRuns {
    cancels: Arc<Mutex<HashMap<u32, CancellationToken>>>,
    next: Arc<AtomicU32>,
}

impl TransferRuns {
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
            .expect("transfer lock poisoned")
            .insert(id, cancel.clone());
        (id, cancel)
    }

    pub fn release(&self, id: u32) {
        self.cancels
            .lock()
            .expect("transfer lock poisoned")
            .remove(&id);
    }

    pub fn cancel(&self, id: u32) {
        if let Some(cancel) = self
            .cancels
            .lock()
            .expect("transfer lock poisoned")
            .get(&id)
            .cloned()
        {
            cancel.cancel();
        }
    }
}

/// 一次传输：构造即 `allocate` + 任务中心；轮询完 `TransferRunner` 后 `release` / `finish`。
#[must_use]
pub struct TransferRun {
    pub id: u32,
    inner: Pin<Box<dyn Future<Output = Result<u32, FileError>> + Send>>,
}

impl Future for TransferRun {
    type Output = Result<u32, FileError>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        self.inner.as_mut().poll(cx)
    }
}

fn task_labels(direction: Direction, req: &TransferRequest) -> (String, String) {
    match direction {
        Direction::Push => (
            format!("上传: {}", req.remote),
            format!("{} → {}", req.local, req.remote),
        ),
        Direction::Pull => (
            format!("下载: {}", req.local),
            format!("{} → {}", req.remote, req.local),
        ),
    }
}

/// 完整寿命：allocate → 任务中心 → `TransferSpec` → `TransferRunner.run` → release → finish。
pub fn run(app: AppHandle, req: TransferRequest, direction: Direction) -> TransferRun {
    let state = app.state::<AppState>();
    let (id, cancel) = state.transfer_runs.allocate();
    let (name, detail) = task_labels(direction, &req);
    let task_id = state.tasks.register(name, detail);
    let transfers = state.transfers.clone();
    let sink = state.event_tx.clone();
    let spec = yohu_files::TransferSpec {
        id,
        serial: req.serial.clone(),
        direction,
        local: req.local.clone(),
        remote: req.remote.clone(),
    };
    let inner = Box::pin(async move {
        let result = transfers.run(spec, cancel, sink).await;
        let state = app.state::<AppState>();
        state.transfer_runs.release(id);
        state.tasks.finish(task_id);
        match result {
            Ok(_) => Ok(id),
            Err(e) => {
                state.app_log.error(format!("传输失败: {e}"));
                Err(e)
            }
        }
    });
    TransferRun { id, inner }
}

/// 调用方已鉴权。只 `tokio::spawn` [`run`]，失败由 `run` 记 `FileError`。
pub fn spawn(app: AppHandle, req: TransferRequest, direction: Direction) -> u32 {
    let job = run(app, req, direction);
    let id = job.id;
    tokio::spawn(job);
    id
}

pub fn cancel(state: &AppState, id: u32) {
    state.transfer_runs.cancel(id);
}
