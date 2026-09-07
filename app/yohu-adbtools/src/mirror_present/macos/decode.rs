//! 解码会话：FramePipe + VideoToolbox。与 NSView 寿命分家。

use std::sync::Arc;
use std::time::Instant;

use yohu_mirror::{EncodedFrame, FramePipe};

use super::super::annexb::{access_unit, select_live_frames};
use super::super::backend::AnnexBDecoder;
use super::vt::{Picture, VideoToolboxDecoder};

pub struct DecodeBind {
    pub pipe: Arc<FramePipe>,
    pub tick: DecodeTick,
}

impl DecodeBind {
    pub fn new(pipe: Arc<FramePipe>) -> Self {
        Self {
            pipe,
            tick: DecodeTick::new(),
        }
    }

    pub fn pull(&self) -> Vec<EncodedFrame> {
        let mut frames = Vec::new();
        while let Some(frame) = self.pipe.try_recv() {
            frames.push(frame);
        }
        frames
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
        }
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
        if self.fed > 0 || self.decoded > 0 {
            tracing::info!(fed = self.fed, decoded = self.decoded, "VT 解码节拍");
        }
        self.fed = 0;
        self.decoded = 0;
    }

    pub fn note_first(&mut self, width: u32, height: u32) {
        if self.first {
            return;
        }
        self.first = true;
        tracing::info!(
            elapsed_ms = self.started.elapsed().as_millis() as u64,
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
        if let Some(dec) = self.decoder.as_ref() {
            if (dec.width(), dec.height()) != (frame.width, frame.height) {
                self.decoder = None;
                self.need_keyframe = true;
            }
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
        if self.decoder.is_none() && !self.failed && frame.width > 0 && frame.height > 0 {
            let hevc = frame.codec == 1;
            match VideoToolboxDecoder::open(hevc, frame.width, frame.height, None) {
                Ok(dec) => self.decoder = Some(dec),
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        width = frame.width,
                        height = frame.height,
                        hevc,
                        "VideoToolbox 解码器启动失败，本会话不再重试"
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
                self.need_keyframe = false;
                Some(pic)
            }
            Ok(None) => None,
            Err(e) => {
                tracing::warn!(error = %e, keyframe = frame.keyframe, "VideoToolbox 解码失败，等待下一关键帧");
                dec.reset();
                self.need_keyframe = true;
                None
            }
        }
    }
}
