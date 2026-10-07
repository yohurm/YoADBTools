//! 解码会话：FramePipe + VideoToolbox。与 NSView 寿命分家。

use std::sync::Arc;
use std::time::Instant;

use yohu_mirror::{EncodedFrame, FramePipe};

use super::super::annexb::{
    begin_feed, claim_first, note_content_size, note_decode_beat, seat_elapsed_ms, select_live_frames,
    should_open_decoder, sticky_config, take_feed, take_open, DecodeSeatKind, FeedOutcome,
};
use super::super::backend::AnnexBDecoder;
use super::vt::{Picture, VideoToolboxDecoder};

pub struct DecodeBind {
    pub pipe: Arc<FramePipe>,
    pub tick: DecodeTick,
}

impl DecodeBind {
    pub fn new(pipe: Arc<FramePipe>) -> Self {
        let mut tick = DecodeTick::new();
        tick.seed_config(pipe.sticky_config());
        Self { pipe, tick }
    }
}

pub struct DecodeTick {
    decoder: Option<VideoToolboxDecoder>,
    failed: bool,
    need_keyframe: bool,
    last_config: Option<Vec<u8>>,
    seen_dropped: u32,
    first: bool,
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
            need_keyframe: true,
            last_config: None,
            seen_dropped: 0,
            first: false,
            started: Instant::now(),
            fed: 0,
            decoded: 0,
            last_content_w: 0,
            last_content_h: 0,
        }
    }

    pub fn seed_config(&mut self, frame: Option<EncodedFrame>) {
        let Some((_, payload)) = sticky_config(frame) else {
            return;
        };
        self.last_config = Some(payload);
    }

    pub fn ingest(&mut self, frames: Vec<EncodedFrame>) -> Option<Picture> {
        let mut live = select_live_frames(&mut self.last_config, frames);
        Self::catch_up(&mut live);
        let mut last = None;
        for frame in live {
            if let Some(pic) = self.decode(frame) {
                last = Some(pic);
            }
        }
        last
    }

    pub fn log_beat(&mut self) {
        note_decode_beat(&mut self.fed, &mut self.decoded, DecodeSeatKind::VideoToolbox);
    }

    pub fn note_first(&mut self, width: u32, height: u32) {
        if !claim_first(&mut self.first) {
            return;
        }
        tracing::info!(
            elapsed_ms = seat_elapsed_ms(self.started),
            width,
            height,
            "VideoToolbox 首帧"
        );
    }

    fn catch_up(frames: &mut Vec<EncodedFrame>) {
        if frames.len() <= 2 {
            return;
        }
        if let Some(i) = frames.iter().rposition(|f| f.keyframe) {
            frames.drain(0..i);
            frames.truncate(1);
        } else {
            frames.clear();
        }
    }

    fn decode(&mut self, frame: EncodedFrame) -> Option<Picture> {
        let size_changed = note_content_size(
            &mut self.last_content_w,
            &mut self.last_content_h,
            frame.width,
            frame.height,
        );
        if size_changed {
            self.decoder = None;
            self.need_keyframe = true;
        }
        if frame.dropped > self.seen_dropped {
            self.seen_dropped = frame.dropped;
            self.need_keyframe = true;
            if let Some(dec) = self.decoder.as_mut() {
                dec.reset();
            }
        }
        if self.need_keyframe && !frame.keyframe {
            return None;
        }
        if should_open_decoder(self.decoder.is_some(), self.failed, frame.has_content_size()) {
            let hevc = frame.is_hevc();
            match take_open(
                &mut self.failed,
                VideoToolboxDecoder::open(hevc, frame.width, frame.height, None),
            ) {
                Ok(dec) => self.decoder = Some(dec),
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        width = frame.width,
                        height = frame.height,
                        hevc,
                        "VideoToolbox 解码器启动失败，本会话不再重试"
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
            FeedOutcome::Picture(pic) => {
                self.need_keyframe = false;
                Some(pic)
            }
            FeedOutcome::Empty => None,
            FeedOutcome::Failed(e) => {
                tracing::warn!(error = %e, keyframe = frame.keyframe, "VideoToolbox 解码失败，等待下一关键帧");
                dec.reset();
                self.need_keyframe = true;
                None
            }
        }
    }
}
