//! 呈现节拍。首帧、fps 采样、失败只记一次，以及管道绑解日志都在这里。
//! Windows 与 macOS 宿主只问这一份。

use std::time::{Duration, Instant};

use tokio::sync::mpsc::Sender;
use yohu_protocol::AppEvent;

use super::control_hand::ControlHand;
use super::stage::Stage;

pub struct PresentBeat {
    painted: u32,
    fps_at: Instant,
    err_logged: bool,
}

impl PresentBeat {
    pub fn new() -> Self {
        Self {
            painted: 0,
            fps_at: Instant::now(),
            err_logged: false,
        }
    }

    /// 管道重新绑定时清计数。时钟留到下一帧再拨。
    pub fn reset(&mut self) {
        self.painted = 0;
        self.err_logged = false;
    }

    /// 这一拍失败。只有第一次返回 true，宿主用它决定要不要打日志。
    pub fn note_failed(&mut self) -> bool {
        if self.err_logged {
            return false;
        }
        self.err_logged = true;
        true
    }

    /// 已画出一帧。`had_frame` 是本帧之前舞台有没有首帧。
    /// 首帧或节拍到了就给出 `mirror/painted`。
    #[allow(clippy::too_many_arguments)]
    pub fn note_presented(
        &mut self,
        serial: &str,
        generation: u64,
        had_frame: bool,
        now: Instant,
        width: u32,
        height: u32,
        beat: Duration,
    ) -> Option<AppEvent> {
        self.err_logged = false;
        self.painted = self.painted.saturating_add(1);
        if !had_frame {
            self.fps_at = now;
            self.painted = 0;
            tracing::info!(serial = %serial, generation, width, height, "投屏首帧已 Present");
            return Some(AppEvent::MirrorPainted {
                serial: serial.to_string(),
                generation,
                painted_fps: 1,
            });
        }
        if now.duration_since(self.fps_at) >= beat {
            let fps = self.painted;
            self.painted = 0;
            self.fps_at = now;
            return Some(AppEvent::MirrorPainted {
                serial: serial.to_string(),
                generation,
                painted_fps: fps,
            });
        }
        None
    }
}

/// 这一拍没画出。`Quiet` 只钉住失败，不打日志。`Announce` 第一次失败时打日志。
pub enum PresentMiss<'a> {
    Quiet,
    Announce(Option<&'a dyn std::fmt::Display>),
}

/// 没画出就钉住失败并按平台决定是否打日志。画出了就记账。
pub fn settle_presented_frame(
    beat: &mut PresentBeat,
    stage: &mut Stage,
    event_tx: &Sender<AppEvent>,
    width: u32,
    height: u32,
    presented: bool,
    miss: PresentMiss<'_>,
) -> bool {
    if !presented {
        if beat.note_failed() {
            if let PresentMiss::Announce(error) = miss {
                log_present_failed(width, height, error);
            }
        }
        return false;
    }
    accept_presented_frame(beat, stage, event_tx, width, height)
}

/// 画出一帧之后的记账。首帧改舞台，有事件就送出。
/// 返回画面是否该留在台上：可见，并且已经是视频。
pub fn accept_presented_frame(
    beat: &mut PresentBeat,
    stage: &mut Stage,
    event_tx: &Sender<AppEvent>,
    width: u32,
    height: u32,
) -> bool {
    let had_frame = stage.has_frame();
    if let Some(event) = beat.note_presented(
        &stage.serial,
        stage.generation,
        had_frame,
        Instant::now(),
        width,
        height,
        crate::limits::PRESENT_BEAT,
    ) {
        if !had_frame {
            stage.mark_frame();
        }
        let _ = event_tx.try_send(event);
    }
    stage.visible() && stage.shows_video()
}

/// 管道绑上：舞台进入启动中，节拍清零，并记下绑定。
pub fn open_pipe(beat: &mut PresentBeat, stage: &mut Stage, serial: String, generation: u64) {
    stage.bind(serial, generation);
    beat.reset();
    log_pipe_bound(&stage.serial, generation);
}

/// 管道松开。目标序列号对不上就不动。对上则抬起触控、清舞台、记下解开。
pub fn release_pipe(stage: &mut Stage, hand: &mut ControlHand, target: &str) -> bool {
    if !target.is_empty() && stage.serial != target {
        return false;
    }
    let serial = stage.serial.clone();
    hand.end_press(&serial);
    stage.unbind();
    log_pipe_unbound(&serial);
    true
}

pub fn log_pipe_bound(serial: &str, generation: u64) {
    tracing::info!(serial = %serial, generation, "投屏解码管道已绑定");
}

pub fn log_pipe_unbound(serial: &str) {
    tracing::info!(serial = %serial, "投屏解码管道已解开，舞台改画 chrome");
}

pub fn log_present_failed(width: u32, height: u32, error: Option<&dyn std::fmt::Display>) {
    if let Some(error) = error {
        tracing::warn!(error = %error, width, height, "投屏 Present 失败");
    } else {
        tracing::warn!(width, height, "投屏 Present 失败");
    }
}

pub fn log_present_exit(err: &dyn std::fmt::Display) {
    tracing::error!("投屏呈现退出: {err}");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn painted_fps(event: &AppEvent) -> u32 {
        match event {
            AppEvent::MirrorPainted { painted_fps, .. } => *painted_fps,
            _ => panic!("not painted"),
        }
    }

    #[test]
    fn first_frame_then_beat_counts_only_later_frames() {
        let mut beat = PresentBeat::new();
        let t0 = Instant::now();
        let first = beat
            .note_presented("S1", 7, false, t0, 100, 200, Duration::from_secs(1))
            .expect("first");
        assert_eq!(painted_fps(&first), 1);
        assert!(beat
            .note_presented("S1", 7, true, t0, 100, 200, Duration::from_secs(1))
            .is_none());
        let sample = beat
            .note_presented(
                "S1",
                7,
                true,
                t0 + Duration::from_secs(1),
                100,
                200,
                Duration::from_secs(1),
            )
            .expect("beat");
        assert_eq!(painted_fps(&sample), 2);
    }

    #[test]
    fn failure_latches_until_a_frame() {
        let mut beat = PresentBeat::new();
        assert!(beat.note_failed());
        assert!(!beat.note_failed());
        let _ = beat.note_presented("S1", 1, false, Instant::now(), 1, 1, Duration::from_secs(1));
        assert!(beat.note_failed());
    }

    #[test]
    fn reset_clears_the_failure_latch() {
        let mut beat = PresentBeat::new();
        assert!(beat.note_failed());
        beat.reset();
        assert!(beat.note_failed());
    }

    fn visible_layout(visible: bool) -> yohu_protocol::MirrorLayout {
        yohu_protocol::MirrorLayout {
            serial: "S1".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 200,
            visible,
            dpr: 1.0,
            fullscreen: false,
            paused: false,
            control: true,
            has_device: true,
            failed: false,
            error: String::new(),
            dark: false,
        }
    }

    #[test]
    fn accept_presented_frame_marks_the_first_and_keeps_video_on_stage() {
        let mut beat = PresentBeat::new();
        let mut stage = Stage::new("S1".into());
        stage.apply_layout(&visible_layout(true));
        stage.bind("S1".into(), 4);
        assert!(stage.is_loading());
        let (tx, mut rx) = tokio::sync::mpsc::channel(2);
        let show = accept_presented_frame(&mut beat, &mut stage, &tx, 10, 20);
        assert!(stage.shows_video());
        assert!(show);
        assert!(rx.try_recv().is_ok());
        assert!(accept_presented_frame(&mut beat, &mut stage, &tx, 10, 20));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn accept_presented_frame_hides_when_the_stage_is_not_visible() {
        let mut beat = PresentBeat::new();
        let mut stage = Stage::new("S1".into());
        stage.apply_layout(&visible_layout(false));
        stage.bind("S1".into(), 4);
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let show = accept_presented_frame(&mut beat, &mut stage, &tx, 10, 20);
        assert!(stage.shows_video());
        assert!(!show);
    }

    #[test]
    fn missed_present_latches_without_marking_a_frame() {
        let mut beat = PresentBeat::new();
        let mut stage = Stage::new("S1".into());
        stage.apply_layout(&visible_layout(true));
        stage.bind("S1".into(), 4);
        let (tx, mut rx) = tokio::sync::mpsc::channel(1);
        assert!(!settle_presented_frame(
            &mut beat,
            &mut stage,
            &tx,
            8,
            9,
            false,
            PresentMiss::Quiet
        ));
        assert!(stage.is_loading());
        assert!(!settle_presented_frame(
            &mut beat,
            &mut stage,
            &tx,
            8,
            9,
            false,
            PresentMiss::Announce(None)
        ));
        assert!(settle_presented_frame(
            &mut beat,
            &mut stage,
            &tx,
            8,
            9,
            true,
            PresentMiss::Quiet
        ));
        assert!(stage.shows_video());
        assert!(rx.try_recv().is_ok());
        let windows = include_str!("windows/host.rs");
        let macos = include_str!("macos/host.rs");
        assert!(!windows.contains("note_failed"));
        assert!(!macos.contains("note_failed"));
        assert!(!windows.contains("accept_presented_frame"));
        assert!(!macos.contains("accept_presented_frame"));
    }

    fn idle_hand() -> ControlHand {
        use std::sync::Arc;
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let mirror = yohu_mirror::MirrorService::new(
            Arc::new(yohu_adb::AdbClient::new(
                yohu_adb::ToolResolver::new(None, std::env::temp_dir(), std::env::temp_dir()),
                1,
            )),
            tx,
            std::env::temp_dir(),
            tokio_util::sync::CancellationToken::new(),
        );
        ControlHand::new(mirror)
    }

    #[test]
    fn open_pipe_enters_loading_and_clears_the_failure_latch() {
        let mut beat = PresentBeat::new();
        assert!(beat.note_failed());
        let mut stage = Stage::new("S1".into());
        open_pipe(&mut beat, &mut stage, "S1".into(), 9);
        assert!(stage.is_loading());
        assert_eq!(stage.generation, 9);
        assert!(beat.note_failed());
    }

    #[test]
    fn release_pipe_ignores_a_different_serial() {
        let mut beat = PresentBeat::new();
        let mut stage = Stage::new("S1".into());
        let mut hand = idle_hand();
        open_pipe(&mut beat, &mut stage, "S1".into(), 9);
        assert!(!release_pipe(&mut stage, &mut hand, "OTHER"));
        assert!(stage.bound());
        assert!(release_pipe(&mut stage, &mut hand, "S1"));
        assert!(!stage.bound());
        assert!(stage.shows_chrome());
    }
}
