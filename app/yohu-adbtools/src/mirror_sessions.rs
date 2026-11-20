//! 投屏会话：计划、任务账本、Present 绑定。commands 只校验在线并转发。
//!
//! **账本键 = `(serial, generation)`**（P1-6，与 `capture_runs` 同形）：迟到世代的
//! `Stopped/Failed` 不得误杀新世代任务，`register` 覆盖旧 id 导致的列表泄漏也随之消失。
//! 账本实现共用 [`crate::run_ledger::RunLedger`]，收口语义只有一份。

use crate::mirror_present::PresentError;
use crate::run_ledger::RunLedger;
use crate::state::AppState;
use yohu_mirror::MirrorError;
use yohu_protocol::{MirrorSessionSnapshot, MirrorSessionState, MirrorStart, MirrorStartRequest};

pub struct MirrorSessions {
    ledger: RunLedger,
}

impl MirrorSessions {
    pub fn new() -> Self {
        Self {
            ledger: RunLedger::new(),
        }
    }
}

impl Default for MirrorSessions {
    fn default() -> Self {
        Self::new()
    }
}

/// 槽位行叠呈现闩。没有会话的设备不出现。
pub fn snapshot(state: &AppState) -> Vec<MirrorSessionSnapshot> {
    state
        .mirror
        .session_rows()
        .into_iter()
        .map(|row| {
            let (has_frame, painted_fps) = state.present.paint_for(&row.serial, row.generation);
            let (paused, fullscreen) = state.present.replay_flags(&row.serial);
            let (present_bind, hole_title, hole_body) = state.present.hole_for(&row.serial);
            MirrorSessionSnapshot {
                serial: row.serial,
                generation: row.generation,
                phase: row.phase,
                width: row.width,
                height: row.height,
                codec: row.codec,
                control: row.control,
                has_frame,
                painted_fps,
                paused,
                fullscreen,
                error: None,
                present_bind,
                hole_title,
                hole_body,
            }
        })
        .collect()
}

/// 调用方已鉴权。
pub async fn start(state: &AppState, req: MirrorStartRequest) -> Result<MirrorStart, MirrorError> {
    let plan =
        crate::mirror_plan::plan_start(&state.settings.snapshot(), req, state.present.hevc_ok());
    tracing::info!(
        serial = %plan.serial,
        control = plan.control,
        force_forward = plan.force_forward,
        codec = %plan.video_codec,
        max_size = plan.max_size,
        bit_rate = plan.video_bit_rate,
        max_fps = plan.max_fps,
        "mirror.start"
    );
    let serial = plan.serial.clone();
    // 起流前先在途标记：只有它存在时，早到的 Stopped/Failed 才会落墓碑（与 `capture_runs` 同形）。
    state.mirror_sessions.ledger.begin(&serial);
    let result = state.mirror.start(plan).await.map_err(|e| {
        state.mirror_sessions.ledger.abandon(&serial);
        tracing::error!(serial = %serial, error = %e, "mirror.start 失败");
        e
    })?;
    tracing::info!(
        serial = %result.serial,
        generation = result.generation,
        adopted = result.adopted,
        "mirror.start 返回"
    );
    if !result.adopted {
        state.mirror_sessions.ledger.register_with(
            &serial,
            result.generation,
            || {
                state.tasks.register(
                    format!("投屏: {serial}"),
                    crate::tasks::device_detail(&serial),
                    None,
                )
            },
        );
    }
    if let Some(pipe) = state.mirror.frame_pipe(&serial) {
        state.present.attach(&serial, result.generation, pipe);
    }
    Ok(result)
}

/// 收口该 `(serial, generation)` 的任务；迟到世代只写墓碑、不误杀新任务。
pub fn finish(state: &AppState, serial: &str, generation: u64) {
    if let Some(task_id) = state.mirror_sessions.ledger.close(serial, generation) {
        state.tasks.finish(task_id);
    }
}

pub fn screenshot(state: &AppState, serial: &str, path: &str) -> Result<(), PresentError> {
    state.present.screenshot(serial, path)?;
    state.app_log.info(format!("投屏截图已保存: {path}"));
    Ok(())
}

/// 事件层只分发：投屏已出画交给呈现服务。
pub fn on_painted(state: &AppState, serial: &str, generation: u64, painted_fps: u32) {
    state.present.note_painted(serial, generation, painted_fps);
}

/// 事件层只分发：投屏会话状态收口与洞内文案在投屏服务里合成。
///
/// 返回需要写回事件的 `(hole_title, hole_body)`；无需填洞时返回 `None`。
/// `generation` 是事件的世代，必须透传给账本——否则迟到世代会误杀新任务（P1-6）。
pub fn on_state(
    state: &AppState,
    serial: &str,
    generation: u64,
    session_state: MirrorSessionState,
    width: u32,
    height: u32,
    error: Option<&str>,
) -> Option<(String, String)> {
    tracing::info!(
        serial,
        generation,
        state = ?session_state,
        "emit mirror/state"
    );
    match session_state {
        MirrorSessionState::Stopped | MirrorSessionState::Failed => {
            state.present.unbind(serial);
            finish(state, serial, generation);
        }
        MirrorSessionState::Live if yohu_mirror::content_size_usable(width, height) => {
            state.present.adopt_content(serial, width, height);
        }
        _ => {}
    }
    let native = cfg!(any(windows, target_os = "macos"));
    let failed = matches!(session_state, MirrorSessionState::Failed);
    crate::mirror_present::session_failure_hole(native, failed, error.unwrap_or(""))
        .map(|(title, body)| (title.to_string(), body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::run_ledger::RegisterOutcome;

    /// 同形于 `capture_runs`：迟到旧世代收口不得结束新世代任务。
    #[test]
    fn finish_matches_generation_only() {
        let sessions = MirrorSessions::new();
        assert_eq!(
            sessions.ledger.register_with("S1", 5, || 11),
            RegisterOutcome::Registered
        );
        assert_eq!(sessions.ledger.close("S1", 4), None, "旧世代不得结束新任务");
        assert_eq!(sessions.ledger.close("S1", 5), Some(11));
        assert_eq!(sessions.ledger.close("S1", 5), None, "同一任务只收口一次");
    }

    /// 旧 id 不再被覆盖：两个世代各持自己的任务，列表不泄漏。
    #[test]
    fn new_generation_does_not_overwrite_old_task_id() {
        let sessions = MirrorSessions::new();
        assert_eq!(
            sessions.ledger.register_with("S1", 1, || 21),
            RegisterOutcome::Registered
        );
        assert_eq!(
            sessions.ledger.register_with("S1", 2, || 22),
            RegisterOutcome::Registered
        );
        assert_eq!(sessions.ledger.close("S1", 1), Some(21));
        assert_eq!(sessions.ledger.close("S1", 2), Some(22));
    }

    /// 账本键含 serial：同世代不同设备互不影响。
    #[test]
    fn ledger_key_includes_serial() {
        let sessions = MirrorSessions::new();
        assert_eq!(
            sessions.ledger.register_with("S1", 3, || 31),
            RegisterOutcome::Registered
        );
        assert_eq!(
            sessions.ledger.register_with("S2", 3, || 32),
            RegisterOutcome::Registered
        );
        assert_eq!(sessions.ledger.close("S2", 3), Some(32));
        assert_eq!(sessions.ledger.close("S1", 3), Some(31));
    }

    /// Stopped 先于 register：不建任务、不留 Active。
    #[test]
    fn stopped_before_register_creates_no_task() {
        let sessions = MirrorSessions::new();
        sessions.ledger.begin("S1");
        assert_eq!(sessions.ledger.close("S1", 9), None);
        assert_eq!(
            sessions.ledger.register_with("S1", 9, || 41),
            RegisterOutcome::AlreadyClosed
        );
        assert_eq!(sessions.ledger.registered_len(), 0);
    }

    /// `mirror.start` 在登记前失败：在途标记与墓碑一起撤回，不留泄漏。
    #[test]
    fn failed_start_leaves_no_tombstone() {
        let sessions = MirrorSessions::new();
        sessions.ledger.begin("S1");
        assert_eq!(sessions.ledger.close("S1", 9), None);
        sessions.ledger.abandon("S1");
        assert_eq!(sessions.ledger.tombstone_len(), 0);
        assert_eq!(sessions.ledger.inflight_len(), 0);
    }
}
