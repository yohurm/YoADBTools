//! 事件分发：core 事件 → Tauri emit（事件名由 AppEvent::name() 决定）。

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use crate::state::AppState;
use yohu_protocol::{AppEvent, CaptureState, MirrorSessionState};

/// 启动分发循环（app 层唯一的事件出口）。
///
/// 注意：必须用 `tauri::async_runtime::spawn` 而非 `tokio::spawn`——
/// 本函数在 Tauri setup（主线程，无 tokio reactor 上下文）调用。
pub fn spawn_dispatcher(
    rx: mpsc::Receiver<AppEvent>,
    app: AppHandle,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            if let AppEvent::CaptureState {
                serial,
                state: CaptureState::Stopped,
                ..
            } = &event
            {
                // 采集结束是任务中心收口的唯一入口（commands / 掉线只 stop，不另调 finish）。
                if let Some(app_state) = app.try_state::<AppState>() {
                    crate::capture_runs::finish(&app_state, serial);
                }
            }
            if let AppEvent::MirrorState {
                serial,
                state,
                width,
                height,
                ..
            } = &event
            {
                if let Some(app_state) = app.try_state::<AppState>() {
                    match state {
                        MirrorSessionState::Stopped | MirrorSessionState::Failed => {
                            app_state.present.unbind(serial);
                            crate::mirror_sessions::finish(&app_state, serial);
                        }
                        MirrorSessionState::Live if *width > 0 && *height > 0 => {
                            app_state.present.adopt_content(serial, *width, *height);
                        }
                        _ => {}
                    }
                }
            }
            let name = event.name();
            if matches!(&event, AppEvent::MirrorState { .. }) {
                tracing::info!(name, "emit mirror/state");
            }
            if let Err(e) = app.emit(name, &event) {
                tracing::warn!(name, error = %e, "事件 emit 失败");
            }
        }
    })
}
