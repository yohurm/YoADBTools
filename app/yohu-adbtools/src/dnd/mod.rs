//! 壳侧拖出：Windows = OLE GetData 才 pull；macOS = pull 后 NSDraggingSession。

#[cfg(target_os = "macos")]
mod macos;
mod names;
#[cfg(windows)]
mod ole;

use std::fs;
use std::path::Path;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tokio_util::sync::CancellationToken;
use yohu_files::TransferRunner;
#[cfg(target_os = "macos")]
use yohu_files::{TransferSpec, TreeEntry};
#[cfg(target_os = "macos")]
use yohu_protocol::Direction;
use yohu_protocol::{AppEvent, DragOutRequest, IpcError, IpcErrorCode};

use crate::commands::{ipc_code, ipc_file};
use crate::state::AppState;
use crate::tasks::TaskCenter;

use self::names::relative_ok;

/// 启动/退出时清掉上次残留的拖出临时目录。
pub fn cleanup_stale(drag_out_root: &Path) {
    if drag_out_root.exists() {
        let _ = fs::remove_dir_all(drag_out_root);
    }
}

pub async fn drag_out(
    app: &AppHandle,
    state: &AppState,
    req: DragOutRequest,
) -> Result<(), IpcError> {
    if req.remotes.is_empty() {
        return Err(ipc_code(IpcErrorCode::InvalidArgs, "未选择文件"));
    }
    let tree = state
        .browser
        .list_tree(&req.serial, &req.remotes, CancellationToken::new())
        .await
        .map_err(ipc_file)?;
    let items: Vec<_> = tree
        .into_iter()
        .filter(|e| relative_ok(&e.relative))
        .collect();
    if items.is_empty() {
        return Err(ipc_code(
            IpcErrorCode::InvalidArgs,
            "没有可拖出的项目（名称非法）",
        ));
    }

    let root = state.paths.drag_out_dir();
    fs::create_dir_all(&root).map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
    let session_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let session_dir = root.join(format!("{session_id}"));
    fs::create_dir_all(&session_dir)
        .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;

    let payload = DragPayload {
        items,
        serial: req.serial,
        session_dir: session_dir.clone(),
        transfers: state.transfers.clone(),
        event_tx: state.event_tx.clone(),
        tasks: Arc::clone(&state.tasks),
        transfer_cancels: Arc::clone(&state.transfer_cancels),
        transfer_next: Arc::clone(&state.transfer_next),
        rt: tokio::runtime::Handle::current(),
    };

    #[cfg(windows)]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let result = ole::do_drag_drop(payload);
            let _ = tx.send(result);
        })
        .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
        rx.await
            .map_err(|_| ipc_code(IpcErrorCode::Internal, "拖出已中断"))?
    }
    #[cfg(target_os = "macos")]
    {
        materialize(&payload).await?;
        let paths = top_locals(&payload.session_dir, &payload.items);
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let result = macos::begin_file_drag(&paths);
            let _ = tx.send(result);
        })
        .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
        rx.await
            .map_err(|_| ipc_code(IpcErrorCode::Internal, "拖出已中断"))?
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (app, payload);
        let _ = fs::remove_dir_all(&session_dir);
        Err(ipc_code(
            IpcErrorCode::Internal,
            "拖出仅支持 Windows 与 macOS",
        ))
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) struct DragPayload {
    pub items: Vec<yohu_files::TreeEntry>,
    pub serial: String,
    pub session_dir: std::path::PathBuf,
    pub transfers: TransferRunner,
    pub event_tx: tokio::sync::mpsc::Sender<AppEvent>,
    pub tasks: Arc<TaskCenter>,
    pub transfer_cancels: Arc<std::sync::Mutex<std::collections::HashMap<u32, CancellationToken>>>,
    pub transfer_next: Arc<std::sync::atomic::AtomicU32>,
    pub rt: tokio::runtime::Handle,
}

#[cfg(target_os = "macos")]
fn top_locals(session_dir: &Path, items: &[TreeEntry]) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for item in items {
        let first = item.relative.split('\\').next().unwrap_or(&item.relative);
        if seen.insert(first.to_string()) {
            out.push(session_dir.join(first));
        }
    }
    out
}

#[cfg(target_os = "macos")]
async fn materialize(payload: &DragPayload) -> Result<(), IpcError> {
    for item in &payload.items {
        let local = payload
            .session_dir
            .join(item.relative.replace('\\', std::path::MAIN_SEPARATOR_STR));
        if item.is_dir {
            fs::create_dir_all(&local)
                .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
            continue;
        }
        if let Some(parent) = local.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
        }
        let id = payload.transfer_next.fetch_add(1, Ordering::Relaxed) + 1;
        let cancel = CancellationToken::new();
        payload
            .transfer_cancels
            .lock()
            .expect("transfer lock")
            .insert(id, cancel.clone());
        let task_id = payload.tasks.register(
            format!("拖出: {}", item.relative),
            format!("{} → {}", item.remote, local.display()),
        );
        let spec = TransferSpec {
            id,
            serial: payload.serial.clone(),
            direction: Direction::Pull,
            local: local.to_string_lossy().into_owned(),
            remote: item.remote.clone(),
        };
        let run = payload
            .transfers
            .run(spec, cancel, payload.event_tx.clone())
            .await;
        payload
            .transfer_cancels
            .lock()
            .expect("transfer lock")
            .remove(&id);
        payload.tasks.finish(task_id);
        run.map_err(ipc_file)?;
    }
    Ok(())
}
