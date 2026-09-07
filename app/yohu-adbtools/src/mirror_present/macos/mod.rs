//! macOS 后端：VideoToolbox + 嵌入 NSView（ADR-v6-028/030）。
//!
//! 禁止用 FFmpeg 或 libavcodec 的 videotoolbox 封装填这个模块。

mod decode;
mod host;
mod surface;
mod view;
mod vt;

use std::sync::mpsc::Sender;
use std::sync::Arc;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use super::backend::Caps;

pub const ID: &str = "videotoolbox";

pub fn probe() -> Caps {
    Caps {
        id: ID,
        hevc: vt::hevc_available(),
    }
}

pub fn spawn_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
) -> Sender<super::backend::Cmd> {
    surface::spawn_surface(serial, owner, mirror, event_tx)
}
