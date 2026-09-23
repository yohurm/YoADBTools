//! 壳侧拖出：Windows = OLE GetData 才 pull；macOS = pull 后 NSDraggingSession。
//! 传输寿命只走 [`crate::transfer_runs::run`]，这里只做 OLE / Finder / 会话目录。

#[cfg(target_os = "macos")]
mod macos;
mod names;
#[cfg(windows)]
mod ole;

use std::fs;
use std::path::Path;
#[cfg(target_os = "macos")]
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tokio_util::sync::CancellationToken;
use yohu_files::FileError;
#[cfg(target_os = "macos")]
use yohu_files::TreeEntry;
use yohu_protocol::DragOutRequest;
#[cfg(any(windows, target_os = "macos"))]
use yohu_protocol::{Direction, TransferRequest};

use crate::state::AppState;

use self::names::{posix_to_win_relative, relative_ok};

/// 启动/退出时清掉上次残留的拖出临时目录。
pub fn cleanup_stale(drag_out_root: &Path) {
    if drag_out_root.exists() {
        let _ = fs::remove_dir_all(drag_out_root);
    }
}

/// 壳侧拖出错误。变体只分类；`FileError::Local` 只装路径。
#[derive(Debug, thiserror::Error)]
pub enum DndError {
    #[error(transparent)]
    Files(#[from] FileError),
    #[error("拖出已中断")]
    Interrupted,
    #[error("拖出仅支持 Windows 与 macOS")]
    #[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
    Unsupported,
    #[error("拖出必须在主线程启动")]
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NeedMainThread,
    #[error("没有可用的拖动手势")]
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NoGesture,
    #[error("没有可用的主窗口")]
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NoWindow,
    #[error("主窗口没有 contentView")]
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NoContentView,
    #[error("拖出文件尚未就绪")]
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NotReady,
    #[error("DoDragDrop 失败: {0}")]
    OleFailed(String),
    #[error("拖出宿主调度失败")]
    Host,
}

fn local_fail(path: &Path) -> FileError {
    FileError::Local(path.display().to_string())
}

pub async fn drag_out(
    app: &AppHandle,
    state: &AppState,
    req: DragOutRequest,
) -> Result<(), DndError> {
    if req.remotes.is_empty() {
        return Err(FileError::EmptyTree(String::new()).into());
    }
    let tree = state
        .browser
        .list_tree(
            &req.serial,
            &req.remotes,
            req.generation,
            CancellationToken::new(),
        )
        .await?;
    let items: Vec<_> = tree
        .into_iter()
        .map(|mut e| {
            e.relative = posix_to_win_relative(&e.relative);
            e
        })
        .filter(|e| relative_ok(&e.relative))
        .collect();
    if items.is_empty() {
        return Err(FileError::EmptyTree(req.remotes.first().cloned().unwrap_or_default()).into());
    }

    let root = state.paths.drag_out_dir();
    fs::create_dir_all(&root).map_err(|_| local_fail(&root))?;
    let session_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let session_dir = root.join(format!("{session_id}"));
    fs::create_dir_all(&session_dir).map_err(|_| local_fail(&session_dir))?;

    let payload = DragPayload {
        items,
        serial: req.serial,
        session_dir: session_dir.clone(),
        app: app.clone(),
        #[cfg(windows)]
        rt: tokio::runtime::Handle::current(),
    };

    #[cfg(windows)]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let result = ole::do_drag_drop(payload);
            let _ = tx.send(result);
        })
        .map_err(|_| DndError::Host)?;
        rx.await.map_err(|_| DndError::Interrupted)?
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
        .map_err(|_| DndError::Host)?;
        rx.await.map_err(|_| DndError::Interrupted)?
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (app, payload);
        let _ = fs::remove_dir_all(&session_dir);
        Err(DndError::Unsupported)
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) struct DragPayload {
    pub items: Vec<yohu_files::TreeEntry>,
    pub serial: String,
    pub session_dir: std::path::PathBuf,
    pub app: AppHandle,
    #[cfg(windows)]
    pub rt: tokio::runtime::Handle,
}

#[cfg(any(windows, target_os = "macos"))]
impl DragPayload {
    fn pull_request(&self, local: &Path, remote: &str) -> TransferRequest {
        TransferRequest {
            serial: self.serial.clone(),
            local: local.to_string_lossy().into_owned(),
            remote: remote.to_string(),
            expected_bytes: None,
        }
    }

    #[cfg(windows)]
    fn pull(&self, local: &Path, remote: &str) -> Result<u32, FileError> {
        self.rt.block_on(crate::transfer_runs::run(
            self.app.clone(),
            self.pull_request(local, remote),
            Direction::Pull,
        ))
    }

    #[cfg(target_os = "macos")]
    async fn pull(&self, local: &Path, remote: &str) -> Result<u32, FileError> {
        crate::transfer_runs::run(
            self.app.clone(),
            self.pull_request(local, remote),
            Direction::Pull,
        )
        .await
    }
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
async fn materialize(payload: &DragPayload) -> Result<(), FileError> {
    for item in &payload.items {
        let local = payload
            .session_dir
            .join(item.relative.replace('\\', std::path::MAIN_SEPARATOR_STR));
        if item.is_dir {
            fs::create_dir_all(&local).map_err(|_| local_fail(&local))?;
            continue;
        }
        if let Some(parent) = local.parent() {
            fs::create_dir_all(parent).map_err(|_| local_fail(parent))?;
        }
        payload.pull(&local, &item.remote).await?;
    }
    Ok(())
}
