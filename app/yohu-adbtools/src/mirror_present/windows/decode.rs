//! 解码座：FramePipe + MF。跟 `mirror.start`/`stop`，不持 HWND。

#![cfg(windows)]

use std::sync::Arc;
use std::time::Instant;

use tokio::sync::oneshot;
use windows::Win32::Media::MediaFoundation::IMFDXGIDeviceManager;
use yohu_mirror::{EncodedFrame, FramePipe};

use super::d3d::D3dDevice;
use super::mf::{DecodedPicture, MfDecoder};
use super::slot::{PictureBank, ReadyFrame};
use crate::limits::PRESENT_BEAT;
use crate::mirror_present::annexb::{
    begin_feed, claim_first, note_content_size, note_decode_beat, seat_elapsed_ms, select_live_frames,
    should_open_decoder, sticky_config, take_feed, take_open, DecodeSeatKind, FeedOutcome,
};

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
                let Some(frames) = pipe.recv_batch(frame) else { break };
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
        let Some((codec, payload)) = sticky_config(frame) else {
            return;
        };
        self.last_codec = Some(codec);
        self.last_config = Some(payload);
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

    /// 喂帧或 drain 失败：丢掉解码器，本会话不再重试。
    fn end_session(&mut self) {
        self.decoder = None;
        self.failed = true;
    }

    pub fn drain(&mut self) -> Option<(u32, u32, u32, u32, DecodedPicture)> {
        let dec = self.decoder.as_mut()?;
        match take_feed(&mut self.decoded, dec.drain()) {
            FeedOutcome::Picture(pic) => Some((
                self.last_content_w.max(1),
                self.last_content_h.max(1),
                dec.width,
                dec.height,
                pic,
            )),
            FeedOutcome::Empty => None,
            FeedOutcome::Failed(e) => {
                tracing::error!(error = %e, "MF drain 失败");
                self.end_session();
                None
            }
        }
    }

    pub fn log_beat(&mut self) {
        note_decode_beat(
            &mut self.fed,
            &mut self.decoded,
            DecodeSeatKind::MediaFoundation,
        );
    }

    pub fn note_first_nv12(
        &mut self,
        content_w: u32,
        content_h: u32,
        picture_w: u32,
        picture_h: u32,
        gpu: bool,
    ) {
        if !claim_first(&mut self.first_nv12) {
            return;
        }
        tracing::info!(
            elapsed_ms = seat_elapsed_ms(self.started),
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
        let size_changed = note_content_size(
            &mut self.last_content_w,
            &mut self.last_content_h,
            frame.width,
            frame.height,
        );
        let codec_changed = self.last_codec.is_some() && self.last_codec != Some(frame.codec);
        if size_changed || codec_changed {
            self.decoder = None;
            self.failed = false;
            if codec_changed {
                self.last_config = None;
            }
        }
        if should_open_decoder(self.decoder.is_some(), self.failed, frame.has_content_size()) {
            let hevc = frame.is_hevc();
            match take_open(
                &mut self.failed,
                MfDecoder::open_with(hevc, frame.width, frame.height, manager),
            ) {
                Ok(dec) => {
                    tracing::info!(
                        hevc,
                        async_mft = dec.is_async(),
                        d3d11 = dec.uses_d3d(),
                        width = frame.width,
                        height = frame.height,
                        elapsed_ms = seat_elapsed_ms(self.started),
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
                        hevc,
                        "MF 解码器启动失败，本会话不再重试"
                    );
                    return None;
                }
            }
        }
        let dec = self.decoder.as_mut()?;
        let payload = begin_feed(
            &mut self.fed,
            self.last_config.as_deref(),
            &frame.payload,
            frame.keyframe,
        );
        match take_feed(&mut self.decoded, dec.feed(&payload, frame.keyframe)) {
            FeedOutcome::Picture(pic) => Some(pic),
            FeedOutcome::Empty => None,
            FeedOutcome::Failed(e) => {
                tracing::error!(error = %e, "MF 解码失败，本会话不再重试");
                self.end_session();
                None
            }
        }
    }
}
