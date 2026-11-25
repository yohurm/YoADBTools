//! 事件分发：core 事件 → Tauri emit（事件名由 AppEvent::name() 决定）。
//!
//! 分发器只做三件事：分派收口、按变体不开口、emit。采集收口进 `capture_runs`（用
//! generation），投屏收口/文案在 `mirror_sessions` / `mirror_present`，用户文案不在
//! 事件层合成。诊断 tracing 归产生侧（`mirror_sessions::on_state`），本层不按变体开洞。

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use crate::state::AppState;
use yohu_protocol::{AppEvent, CaptureState};

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
        while let Some(mut event) = rx.recv().await {
            let app_state = app.try_state::<AppState>();
            match &mut event {
                AppEvent::CaptureState {
                    serial,
                    generation,
                    state: CaptureState::Stopped,
                } => {
                    if let Some(state) = &app_state {
                        crate::capture_runs::finish(state, serial, *generation);
                    }
                }
                AppEvent::MirrorPainted {
                    serial,
                    generation,
                    painted_fps,
                } => {
                    if let Some(state) = &app_state {
                        crate::mirror_sessions::on_painted(
                            state,
                            serial,
                            *generation,
                            *painted_fps,
                        );
                    }
                }
                AppEvent::MirrorState {
                    serial,
                    generation,
                    state,
                    width,
                    height,
                    error,
                    hole_title,
                    hole_body,
                    ..
                } => {
                    if let Some(host) = &app_state {
                        if let Some((title, body)) = crate::mirror_sessions::on_state(
                            host,
                            serial,
                            *generation,
                            *state,
                            *width,
                            *height,
                            error.as_deref(),
                        ) {
                            *hole_title = Some(title);
                            *hole_body = Some(body);
                        }
                    }
                }
                _ => {}
            }
            let name = event.name();
            if let Err(e) = app.emit(name, &event) {
                tracing::warn!(name, error = %e, "事件 emit 失败");
            }
        }
    })
}
