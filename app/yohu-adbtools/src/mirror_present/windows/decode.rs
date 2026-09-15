//! 解码座：FramePipe + MF。跟 `mirror.start`/`stop`，不持 HWND。

#![cfg(windows)]

use std::sync::Arc;
use std::time::Instant;

use tokio::sync::oneshot;
use windows::Win32::Media::MediaFoundation::IMFDXGIDeviceManager;
use yohu_mirror::{EncodedFrame, FramePipe, PIPE_H265};

use super::d3d::D3dDevice;
use super::mf::{DecodedPicture, MfDecoder};
use super::slot::{PictureBank, ReadyFrame};
use crate::limits::PRESENT_BEAT;
use crate::mirror_present::annexb::{access_unit, select_live_frames};

/// 解码座句柄。丢弃即取消本代际解码任务。
pub struct DecodeSeat {
    _stop: Option<oneshot::Sender<()>>,
}

impl DecodeSeat {
    pub fn start(
        device: Arc<D3dDevice>,
        pipe: Arc<FramePipe>,
        bank: Arc<PictureBank>,
        serial: String,
        generation: u64,
    ) -> Self {
        let (stop_tx, stop_rx) = oneshot::channel();
        tracing::info!(serial = %serial, generation, "投屏解码座已启动");
        tauri::async_runtime::spawn(async move {
            run_seat(device, pipe, bank, serial, generation, stop_rx).await;
        });
        Self {
            _stop: Some(stop_tx),
        }
    }
}

async fn run_seat(
    device: Arc<D3dDevice>,
    pipe: Arc<FramePipe>,
    bank: Arc<PictureBank>,
    serial: String,
    generation: u64,
    mut stop_rx: oneshot::Receiver<()>,
) {
    if let Err(e) = super::mf::ensure_startup() {
        tracing::error!(error = %e, "投屏解码座 MF 启动失败");
        return;
    }
    let mut tick = DecodeTick::new();
    tick.seed_config(pipe.sticky_config());
    let mut beat = tokio::time::interval(PRESENT_BEAT);
    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            _ = beat.tick() => tick.log_beat(),
            frame = pipe.recv() => {
                let Some(first) = frame else { break };
                let mut frames = vec![first];
                while let Some(next) = pipe.try_recv() {
                    frames.push(next);
                }
                let manager = device.dxgi_manager.clone();
                if let Some((content_w, content_h, picture_w, picture_h, picture)) =
                    tick.ingest(manager.as_ref(), frames)
                {
                    tick.note_first_nv12(
                        content_w,
                        content_h,
                        picture_w,
                        picture_h,
                        matches!(picture, DecodedPicture::Gpu { .. }),
                    );
                    bank.publish(ReadyFrame {
                        serial: serial.clone(),
                        generation,
                        content_w,
                        content_h,
                        picture_w,
                        picture_h,
                        picture,
                    });
                }
                while let Some((content_w, content_h, picture_w, picture_h, picture)) = tick.drain()
                {
                    bank.publish(ReadyFrame {
                        serial: serial.clone(),
                        generation,
                        content_w,
                        content_h,
                        picture_w,
                        picture_h,
                        picture,
                    });
                }
            }
        }
    }
    tracing::info!(serial = %serial, generation, "投屏解码座已停止");
}

pub struct DecodeTick {
    decoder: Option<MfDecoder>,
    failed: bool,
    last_config: Option<Vec<u8>>,
    last_codec: Option<u8>,
    first_nv12: bool,
    started: Instant,
    fed: u32,
    decoded: u32,
    last_content_w: u32,
    last_content_h: u32,
}

impl DecodeTick {
    pub fn new() -> Self {
        Self {
            decoder: None,
            failed: false,
            last_config: None,
            last_codec: None,
            first_nv12: false,
            started: Instant::now(),
            fed: 0,
            decoded: 0,
            last_content_w: 0,
            last_content_h: 0,
        }
    }

    pub fn seed_config(&mut self, frame: Option<EncodedFrame>) {
        let Some(frame) = frame else {
            return;
        };
        self.last_codec = Some(frame.codec);
        self.last_config = Some(frame.payload);
    }

    pub fn ingest(
        &mut self,
        manager: Option<&IMFDXGIDeviceManager>,
        frames: Vec<EncodedFrame>,
    ) -> Option<(u32, u32, u32, u32, DecodedPicture)> {
        let mut last = None;
        for frame in select_live_frames(&mut self.last_config, frames) {
            let content_w = frame.width;
            let content_h = frame.height;
            if let Some(pic) = self.decode(manager, frame) {
                let (picture_w, picture_h) = self
                    .decoder
                    .as_ref()
                    .map(|d| (d.width, d.height))
                    .unwrap_or((content_w, content_h));
                last = Some((content_w, content_h, picture_w, picture_h, pic));
            }
        }
        last
    }

    pub fn drain(&mut self) -> Option<(u32, u32, u32, u32, DecodedPicture)> {
        let dec = self.decoder.as_mut()?;
        match dec.drain() {
            Ok(Some(pic)) => {
                self.decoded += 1;
                Some((
                    self.last_content_w.max(1),
                    self.last_content_h.max(1),
                    dec.width,
                    dec.height,
                    pic,
                ))
            }
            Ok(None) => None,
            Err(e) => {
                tracing::error!(error = %e, "MF drain 失败");
                self.decoder = None;
                self.failed = true;
                None
            }
        }
    }

    pub fn log_beat(&mut self) {
        if self.fed > 0 || self.decoded > 0 {
            tracing::info!(fed = self.fed, decoded = self.decoded, "MF 解码节拍");
        }
        self.fed = 0;
        self.decoded = 0;
    }

    pub fn note_first_nv12(
        &mut self,
        content_w: u32,
        content_h: u32,
        picture_w: u32,
        picture_h: u32,
        gpu: bool,
    ) {
        if self.first_nv12 {
            return;
        }
        self.first_nv12 = true;
        tracing::info!(
            elapsed_ms = self.started.elapsed().as_millis() as u64,
            content_w,
            content_h,
            picture_w,
            picture_h,
            gpu,
            "MF 首帧"
        );
    }

    fn decode(
        &mut self,
        manager: Option<&IMFDXGIDeviceManager>,
        frame: EncodedFrame,
    ) -> Option<DecodedPicture> {
        let size_changed = self.last_content_w > 0
            && (self.last_content_w, self.last_content_h) != (frame.width, frame.height);
        self.last_content_w = frame.width;
        self.last_content_h = frame.height;
        let codec_changed = self.last_codec.is_some() && self.last_codec != Some(frame.codec);
        if size_changed || codec_changed {
            self.decoder = None;
            self.failed = false;
            if codec_changed {
                self.last_config = None;
            }
        }
        if self.decoder.is_none() && !self.failed && frame.width > 0 && frame.height > 0 {
            let hevc = frame.codec == PIPE_H265;
            match MfDecoder::open_with(hevc, frame.width, frame.height, manager) {
                Ok(dec) => {
                    tracing::info!(
                        hevc,
                        async_mft = dec.is_async(),
                        d3d11 = dec.uses_d3d(),
                        width = frame.width,
                        height = frame.height,
                        elapsed_ms = self.started.elapsed().as_millis() as u64,
                        "MF 解码器已启动"
                    );
                    self.decoder = Some(dec);
                    self.last_codec = Some(frame.codec);
                }
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        width = frame.width,
                        height = frame.height,
                        hevc = frame.codec == PIPE_H265,
                        "MF 解码器启动失败，本会话不再重试"
                    );
                    self.failed = true;
                    return None;
                }
            }
        }
        let dec = self.decoder.as_mut()?;
        let payload = access_unit(self.last_config.as_deref(), &frame.payload, frame.keyframe);
        self.fed += 1;
        match dec.feed(&payload, frame.keyframe) {
            Ok(Some(pic)) => {
                self.decoded += 1;
                Some(pic)
            }
            Ok(None) => None,
            Err(e) => {
                tracing::error!(error = %e, "MF 解码失败，本会话不再重试");
                self.decoder = None;
                self.failed = true;
                None
            }
        }
    }
}
