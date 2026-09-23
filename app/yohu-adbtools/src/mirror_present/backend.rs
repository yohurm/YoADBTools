//! 投屏呈现后端契约（ADR-v6-028）。
//!
//! 编译期选一个 OS 后端。禁止 FFmpeg / libavcodec / ffmpeg.exe。
//! GPU 纹理类型是关联类型，不进本模块。

use std::sync::mpsc::Sender;

use yohu_mirror::FramePipe;
use yohu_protocol::{MirrorLayout, MirrorPointerKind};

use super::PresentError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Caps {
    pub id: &'static str,
    pub hevc: bool,
}

pub enum Cmd {
    Layout(MirrorLayout),
    BindPipe {
        serial: String,
        generation: u64,
        /// macOS 表面仍用此管道建 DecodeBind；Windows 解码座已持有同一 `Arc`。
        #[allow(dead_code)]
        pipe: std::sync::Arc<FramePipe>,
    },
    UnbindPipe {
        serial: String,
    },
    /// session 内容宽高。占用 / 描边 / dest 只认这个，不认硬解纹理。
    AdoptContent {
        width: u32,
        height: u32,
    },
    Screenshot {
        path: String,
        reply: Sender<Result<(), PresentError>>,
    },
    Pointer {
        kind: MirrorPointerKind,
        x: i32,
        y: i32,
    },
    Shutdown,
}

/// Annex-B 直播解码器。`Picture` / `Bind` 由后端自定，禁止在本 trait 上摊成 packed NV12。
///
/// Windows 热路径故意走 `MfDecoder` 固有方法，不为跨平台上 vtable。
#[allow(dead_code)]
pub trait AnnexBDecoder: Sized {
    type Picture;
    type Bind;

    fn open(hevc: bool, width: u32, height: u32, bind: Option<&Self::Bind>)
        -> Result<Self, String>;

    fn width(&self) -> u32;
    fn height(&self) -> u32;

    fn feed(&mut self, annexb: &[u8], keyframe: bool) -> Result<Option<Self::Picture>, String>;

    fn drain(&mut self) -> Result<Option<Self::Picture>, String>;
}

#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
pub(crate) fn unimplemented_screenshot_err(id: &'static str) -> PresentError {
    PresentError::Internal(format!(
        "{id} 投屏后端未实现：预留系统硬解，禁止用 FFmpeg 填坑"
    ))
}

#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
pub fn spawn_unimplemented(id: &'static str, serial: &str) -> Sender<Cmd> {
    let (tx, rx) = std::sync::mpsc::channel();
    let label = format!("mirror-present-{id}-{serial}");
    let _ = std::thread::Builder::new().name(label).spawn(move || loop {
        match rx.recv() {
            Ok(Cmd::Screenshot { reply, .. }) => {
                let _ = reply.send(Err(unimplemented_screenshot_err(id)));
            }
            Ok(Cmd::Shutdown) | Err(_) => break,
            Ok(_) => {}
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use super::{unimplemented_screenshot_err, Cmd};
    use crate::mirror_present::PresentError;

    #[test]
    fn unimplemented_screenshot_is_internal_not_empty() {
        let err = unimplemented_screenshot_err("none");
        assert!(matches!(err, PresentError::Internal(_)));
        assert_ne!(err, PresentError::Empty);
        assert_eq!(
            err.to_string(),
            "none 投屏后端未实现：预留系统硬解，禁止用 FFmpeg 填坑"
        );

        let tx = super::spawn_unimplemented("none", "S1");
        let (reply_tx, reply_rx) = std::sync::mpsc::channel();
        tx.send(Cmd::Screenshot {
            path: String::new(),
            reply: reply_tx,
        })
        .expect("unimplemented thread");
        let reply = reply_rx
            .recv_timeout(std::time::Duration::from_secs(2))
            .expect("screenshot reply");
        let err = reply.expect_err("unimplemented must fail");
        assert!(matches!(err, PresentError::Internal(_)));
        assert_ne!(err, PresentError::Empty);
        let _ = tx.send(Cmd::Shutdown);
    }
}
