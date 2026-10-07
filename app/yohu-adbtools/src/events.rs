//! 事件分发：core 事件 → Tauri emit（事件名由 AppEvent::name() 决定）。

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use crate::state::AppState;
use yohu_mirror::content_size_usable;
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
                        MirrorSessionState::Live if content_size_usable(*width, *height) => {
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

#[cfg(test)]
mod tests {
    use yohu_domain::LogLevel;

    #[test]
    fn app_log_words_come_from_the_level() {
        assert_eq!(
            crate::yolog::parse_level(LogLevel::Warn.as_str()),
            LogLevel::Warn
        );
        assert_eq!(
            crate::yolog::parse_level(LogLevel::Error.as_str()),
            LogLevel::Error
        );
        assert_eq!(
            crate::yolog::parse_level(LogLevel::Info.as_str()),
            LogLevel::Info
        );
        assert_eq!(crate::yolog::parse_level("nope"), LogLevel::Info);
        let src = include_str!("yolog.rs");
        assert!(!src.contains("\"warn\""));
        assert!(!src.contains("\"error\""));
        assert!(!src.contains("\"info\""));
    }

    fn strip_owner_line(src: &str, needle: &str) -> String {
        let mut dropped = false;
        src.lines()
            .filter(|line| {
                if !dropped && line.contains(needle) {
                    dropped = true;
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn command_outcome_is_settled_once() {
        let needle = "into_eval_result()";
        let owner = include_str!("terminal_eval.rs");
        let rest = strip_owner_line(owner, needle);
        assert!(
            !rest.contains(needle),
            "{needle} remains in terminal_eval after the owner line"
        );
        let others = [
            include_str!("browse_runs.rs"),
            include_str!("capture_runs.rs"),
            include_str!("library_store.rs"),
            include_str!("update_runs.rs"),
            include_str!("settings_store.rs"),
            include_str!("ipc_update.rs"),
            include_str!("group_runs.rs"),
            include_str!("tasks.rs"),
        ];
        for src in others {
            assert!(!src.contains(needle), "{needle} rewritten outside the owner");
        }
    }

    #[test]
    fn transfer_lock_sentence_once() {
        let src = include_str!("transfer_runs.rs");
        let production = src
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(src);
        assert_eq!(production.matches("transfer lock poisoned").count(), 1);
    }

    #[test]
    fn update_cancel_lock_sentence_once() {
        let src = include_str!("update_runs.rs");
        let production = src
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(src);
        assert_eq!(production.matches("update cancel lock poisoned").count(), 1);
    }

    #[test]
    fn mirror_task_lock_sentence_once() {
        let src = include_str!("mirror_sessions.rs");
        let production = src
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(src);
        assert_eq!(production.matches("mirror task lock poisoned").count(), 1);
    }

    #[test]
    fn capture_task_lock_sentence_once() {
        let src = include_str!("capture_runs.rs");
        let production = src
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(src);
        assert_eq!(production.matches("capture lock poisoned").count(), 1);
    }
}
