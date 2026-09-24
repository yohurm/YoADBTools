//! 应用更新运行：下载取消槽、任务中心、覆盖安装退出。commands 只转发。
//!
//! 下载与文件传输同纪律：`update.download` invoke 立即返回，字节进度经 `update/progress` 推送
//!（禁止在 invoke 内 await 整段 HTTP，否则 WebView 在命令结束前收不到事件）。

use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use tokio::sync::mpsc;

use crate::state::AppState;
use yohu_protocol::{
    AppEvent, AppIdentity, RemoteUpdate, UpdateChannelInfo, UpdateDownloadAccepted,
    UpdateDownloadRequest, UpdateProgress, UpdateStage,
};
use yohu_update::{
    assert_cached_installer, check_configured, describe_channel, download_configured,
    installed_exe_path, spawn_overlay_install, PlatformInfo, UpdateError,
};

pub struct UpdateRuns {
    download_cancel: std::sync::Mutex<Option<CancellationToken>>,
}

impl UpdateRuns {
    pub fn new() -> Self {
        Self {
            download_cancel: std::sync::Mutex::new(None),
        }
    }

    fn replace_cancel(&self) -> CancellationToken {
        let cancel = CancellationToken::new();
        let mut slot = self
            .download_cancel
            .lock()
            .expect("update cancel lock poisoned");
        if let Some(prev) = slot.take() {
            prev.cancel();
        }
        *slot = Some(cancel.clone());
        cancel
    }

    fn clear_if_current(&self, cancel: &CancellationToken) {
        let mut slot = self
            .download_cancel
            .lock()
            .expect("update cancel lock poisoned");
        if slot.as_ref().is_some_and(|c| c == cancel) {
            *slot = None;
        }
    }

    /// 下载字节 200ms 节流在 core；壳侧满队列时 fallback `send`，避免进度条长期 0%。
    fn emit_progress(tx: &mpsc::Sender<AppEvent>, progress: UpdateProgress) {
        let lossy = matches!(progress.stage, UpdateStage::Downloading);
        let event = AppEvent::UpdateProgress(progress);
        let tx = tx.clone();
        tauri::async_runtime::spawn(async move {
            if lossy {
                if tx.try_send(event.clone()).is_err() {
                    let _ = tx.send(event).await;
                }
            } else {
                let _ = tx.send(event).await;
            }
        });
    }

    fn emit_failed(tx: &mpsc::Sender<AppEvent>, version: String, err: UpdateError) {
        Self::emit_progress(
            tx,
            UpdateProgress {
                version,
                stage: UpdateStage::Failed,
                received_bytes: 0,
                total_bytes: 0,
                installer_path: None,
                message: Some(err.to_string()),
            },
        );
    }

    pub fn cancel(&self) {
        if let Some(cancel) = self
            .download_cancel
            .lock()
            .expect("update cancel lock poisoned")
            .take()
        {
            cancel.cancel();
        }
    }
}

pub async fn check(state: &AppState) -> Result<RemoteUpdate, UpdateError> {
    let platform =
        PlatformInfo::from_identity(&AppIdentity::with_version(env!("CARGO_PKG_VERSION")));
    check_configured(&state.paths.config_dir, platform).await
}

pub fn info(state: &AppState) -> Result<UpdateChannelInfo, UpdateError> {
    describe_channel(&state.paths.config_dir)
}

/// 登记任务并后台下载；invoke 边界立即返回 [`UpdateDownloadAccepted`]。
pub fn spawn_download(
    app: &AppHandle,
    state: &AppState,
    request: UpdateDownloadRequest,
) -> Result<UpdateDownloadAccepted, UpdateError> {
    yohu_update::assert_http_url(&request.url)?;
    let cancel = state.update_runs.replace_cancel();
    let version_label = if request.version.is_empty() {
        "安装包".into()
    } else {
        format!("v{}", request.version.trim_start_matches(['v', 'V']))
    };
    let task_id = state
        .tasks
        .register("下载更新".into(), version_label, None);
    let event_tx = state.event_tx.clone();
    let config_dir = state.paths.config_dir.clone();
    let version = request.version.clone();
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        let result = download_configured(
            &config_dir,
            request,
            cancel.clone(),
            |progress| UpdateRuns::emit_progress(&event_tx, progress),
        )
        .await;
        let state = app.state::<AppState>();
        state.update_runs.clear_if_current(&cancel);
        state.tasks.finish(task_id);
        if let Err(e) = result {
            state.app_log.warn(format!("更新下载失败: {e}"));
            UpdateRuns::emit_failed(&event_tx, version, e);
        }
    });

    Ok(UpdateDownloadAccepted)
}

pub fn install(app: &AppHandle, state: &AppState, path: &str) -> Result<(), UpdateError> {
    let installer = assert_cached_installer(std::path::Path::new(path))?;
    let relaunch = installed_exe_path()?;
    let pid = std::process::id();
    let _ = state.event_tx.try_send(AppEvent::UpdateProgress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Applying,
        received_bytes: 0,
        total_bytes: 0,
        installer_path: None,
        message: None,
    }));
    let should_exit = spawn_overlay_install(&installer, pid, &relaunch)?;
    if should_exit {
        state.app_log.info("已启动覆盖安装，即将退出以便写入主程序");
        state.root_cancel.cancel();
        if let Err(e) = state.settings.save_atomic() {
            tracing::warn!("覆盖安装前保存设置失败: {e}");
        }
        app.exit(0);
    } else {
        state.app_log.info("已打开安装包，请拖入应用程序文件夹");
    }
    Ok(())
}

pub fn cancel(state: &AppState) {
    state.update_runs.cancel();
}

pub fn open(url: &str) -> Result<(), UpdateError> {
    let url = yohu_update::assert_http_url(url)?;
    yohu_runtime::open_url(url).map_err(|e| UpdateError::Io(e.to_string()))?;
    Ok(())
}
