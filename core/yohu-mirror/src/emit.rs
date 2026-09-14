//! 投屏会话状态事件。槽位机与解复用共用，不进 pump。

use tokio::sync::mpsc;
use yohu_protocol::{AppEvent, MirrorSessionState};

pub async fn emit_live(
    sink: &mpsc::Sender<AppEvent>,
    serial: &str,
    generation: u64,
    width: u32,
    height: u32,
    codec: &str,
    control: bool,
) {
    let _ = sink
        .send(AppEvent::MirrorState {
            serial: serial.to_string(),
            generation,
            state: MirrorSessionState::Live,
            width,
            height,
            codec: codec.to_string(),
            control,
            error: None,
        })
        .await;
}

pub async fn emit_terminal_state(
    sink: &mpsc::Sender<AppEvent>,
    serial: &str,
    generation: u64,
    state: MirrorSessionState,
    error: Option<String>,
) {
    let _ = sink
        .send(AppEvent::MirrorState {
            serial: serial.to_string(),
            generation,
            state,
            width: 0,
            height: 0,
            codec: String::new(),
            control: false,
            error,
        })
        .await;
}
