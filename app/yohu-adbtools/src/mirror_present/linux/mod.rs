//! Linux 呈现（ADR-v6-042）。
//!
//! 有 H.264 VLD 时 Convert 走 libva。否则在本目录 `dlopen` Cisco OpenH264。
//! 两种画面都画进已记下的 `GtkWindow` 的 GDK 子窗口。`Caps.id` 仍是 `vaapi`。
//! 不链 FFmpeg、libavcodec，也不使用 FFmpeg 的 vaapi 封装。

mod color;
mod h264;
mod host;
mod openh264;
mod surface;
mod vaapi;
mod widget;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use super::backend::{Caps, Cmd, PresentBind};

pub const ID: &str = "vaapi";

pub fn probe() -> Caps {
    let found = vaapi::probe_caps();
    if found.h264 {
        tracing::info!("VA-API 有 H.264 VLD");
    }
    if found.hevc {
        tracing::info!("VA-API 有 HEVC Main VLD。本版还不能提交 HEVC 画面，会话仍用 H.264");
    }
    Caps { id: ID, hevc: false }
}

pub fn spawn_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    bind: Arc<Mutex<PresentBind>>,
    openh264_on: Arc<AtomicBool>,
    openh264_dir: PathBuf,
) -> Sender<Cmd> {
    surface::spawn_surface(
        serial,
        owner,
        mirror,
        event_tx,
        bind,
        openh264_on,
        openh264_dir,
    )
}
