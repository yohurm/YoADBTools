//! Stage 宿主：占用 / chrome / 输入 / 截图。解码管道不在这里。

use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, MirrorControlMessage, MirrorLayout};

use super::super::pointer::{PointerGesture, PointerKind, TouchOut, TOUCH_DOWN, TOUCH_MOVE, TOUCH_UP};
use super::super::scale::map_client_to_video;
use super::super::stage::Stage;
use super::vt::Picture;

pub struct Host {
    pub stage: Stage,
    last_pic: Option<Picture>,
    gesture: PointerGesture,
    painted: u32,
    fps_at: Instant,
    present_err_logged: bool,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
}

impl Host {
    pub fn new(
        serial: String,
        mirror: Arc<MirrorService>,
        event_tx: tokio_mpsc::Sender<AppEvent>,
    ) -> Self {
        Self {
            stage: Stage::new(serial),
            last_pic: None,
            gesture: PointerGesture::default(),
            painted: 0,
            fps_at: Instant::now(),
            present_err_logged: false,
            mirror,
            event_tx,
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        self.stage.apply_layout(layout);
        self.stage.set_host_size(layout.width, layout.height);
        if !self.stage.control() {
            self.end_press();
        }
        tracing::debug!(
            serial = %self.stage.serial,
            x = layout.x,
            y = layout.y,
            w = layout.width,
            h = layout.height,
            visible = layout.visible,
            dpr = layout.dpr,
            "投屏可用区已交给 macOS 表面"
        );
    }

    pub fn bind(&mut self, serial: String, generation: u64) {
        self.stage.bind(serial, generation);
        self.present_err_logged = false;
        self.painted = 0;
        tracing::info!(
            serial = %self.stage.serial,
            generation,
            "投屏解码管道已绑定"
        );
    }

    pub fn unbind(&mut self, target: &str) -> bool {
        if !target.is_empty() && self.stage.serial != target {
            return false;
        }
        self.end_press();
        let serial = self.stage.serial.clone();
        self.stage.unbind();
        tracing::info!(serial = %serial, "投屏解码管道已解开，舞台改画 chrome");
        true
    }

    pub fn adopt_encoded_size(&mut self, width: u32, height: u32) {
        if !self.stage.bound() {
            return;
        }
        if self.stage.set_video_size(width, height) {
            tracing::info!(
                serial = %self.stage.serial,
                width,
                height,
                "投屏在解码前记下编码尺寸"
            );
        }
    }

    pub fn present_picture(&mut self, pic: Picture) -> bool {
        let width = pic.width;
        let height = pic.height;
        let _ = self.stage.set_video_size(width, height);
        if !self.stage.presentable() || !self.stage.allows_video_present() {
            return false;
        }
        self.last_pic = Some(pic);
        self.commit_video(width, height, true);
        true
    }

    pub fn screenshot(&self, path: &str) -> Result<(), String> {
        let pic = self
            .last_pic
            .as_ref()
            .ok_or_else(|| "尚无画面".to_string())?;
        let bgra = pic.copy_bgra()?;
        write_bgra_png(path, pic.width, pic.height, &bgra)
    }

    pub fn handle_pointer(&mut self, action: u8, x: i32, y: i32) {
        if !self.stage.control() {
            self.end_press();
            return;
        }
        let kind = match action {
            TOUCH_DOWN => PointerKind::Down,
            TOUCH_MOVE => PointerKind::Move,
            TOUCH_UP => PointerKind::Up,
            _ => return,
        };
        let (video_w, video_h) = self.stage.video_size();
        let mapped = map_client_to_video(x, y, self.stage.dest(), video_w, video_h);
        if let Some(out) = self.gesture.feed(kind, mapped, video_w, video_h) {
            self.inject_touch(out);
        }
    }

    pub fn handle_leave(&mut self) {
        if let Some(out) = self.gesture.feed(PointerKind::Leave, None, 0, 0) {
            self.inject_touch(out);
        }
    }

    pub fn end_press(&mut self) {
        if let Some(out) = self.gesture.cancel() {
            self.inject_touch(out);
        }
    }

    fn inject_touch(&self, out: TouchOut) {
        let serial = self.stage.serial.clone();
        let mirror = Arc::clone(&self.mirror);
        let message = MirrorControlMessage::Touch {
            action: out.action,
            x: out.x,
            y: out.y,
            width: out.width,
            height: out.height,
        };
        tauri::async_runtime::spawn(async move {
            let _ = mirror.inject(&serial, message).await;
        });
    }

    fn commit_video(&mut self, width: u32, height: u32, presented: bool) -> bool {
        if !presented {
            if !self.present_err_logged {
                self.present_err_logged = true;
                tracing::warn!(width, height, "投屏 Present 失败");
            }
            return false;
        }
        self.present_err_logged = false;
        self.painted += 1;
        let now = Instant::now();
        if !self.stage.has_frame() {
            self.stage.mark_frame();
            self.fps_at = now;
            self.painted = 0;
            tracing::info!(
                serial = %self.stage.serial,
                generation = self.stage.generation,
                width,
                height,
                "投屏首帧已 Present"
            );
            let _ = self.event_tx.try_send(AppEvent::MirrorPainted {
                serial: self.stage.serial.clone(),
                generation: self.stage.generation,
                painted_fps: 1,
            });
        } else if now.duration_since(self.fps_at) >= Duration::from_secs(1) {
            let fps = self.painted;
            self.painted = 0;
            self.fps_at = now;
            let _ = self.event_tx.try_send(AppEvent::MirrorPainted {
                serial: self.stage.serial.clone(),
                generation: self.stage.generation,
                painted_fps: fps,
            });
        }
        self.stage.visible() && self.stage.shows_video()
    }
}

pub fn write_bgra_png(path: &str, w: u32, h: u32, bgra: &[u8]) -> Result<(), String> {
    let mut rgba = vec![0u8; bgra.len()];
    for (i, chunk) in bgra.as_chunks::<4>().0.iter().enumerate() {
        rgba[i * 4] = chunk[2];
        rgba[i * 4 + 1] = chunk[1];
        rgba[i * 4 + 2] = chunk[0];
        rgba[i * 4 + 3] = 255;
    }
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(file, w, h);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
    Ok(())
}

pub const fn touch_down() -> u8 {
    TOUCH_DOWN
}
pub const fn touch_up() -> u8 {
    TOUCH_UP
}
pub const fn touch_move() -> u8 {
    TOUCH_MOVE
}
