//! 视频通道握手与解复用循环。控制写入在 [`crate::control`]。

use std::sync::Arc;
use std::time::Instant;

use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use yohu_protocol::{scrcpy, AppEvent};

use crate::codec::VideoCodec;
use crate::consts::ACCEPT;
use crate::demux::{parse_header, HeaderKind};
use crate::emit;
use crate::error::MirrorError;
use crate::frame::{EncodedFrame, FramePipe};

pub struct Handshake {
    pub codec: VideoCodec,
    pub width: u32,
    pub height: u32,
}

pub async fn read_handshake(
    video: &mut TcpStream,
    cancel: &CancellationToken,
) -> Result<Handshake, MirrorError> {
    let mut name_buf = [0u8; scrcpy::DEVICE_NAME_FIELD_LENGTH];
    read_exact_timeout(video, &mut name_buf, cancel).await?;

    let mut codec_buf = [0u8; 4];
    read_exact_timeout(video, &mut codec_buf, cancel).await?;
    let codec = VideoCodec::from_fourcc(u32::from_be_bytes(codec_buf))?;

    let mut header = [0u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH];
    read_exact_timeout(video, &mut header, cancel).await?;
    let (width, height) = match parse_header(&header).map_err(MirrorError::Protocol)? {
        HeaderKind::Session { width, height } => (width, height),
        HeaderKind::Media { .. } => {
            return Err(MirrorError::Protocol("首包不是 session 头".into()));
        }
    };
    Ok(Handshake {
        codec,
        width,
        height,
    })
}

pub struct MediaLoop {
    pub video: TcpStream,
    pub frames: Arc<FramePipe>,
    pub sink: mpsc::Sender<AppEvent>,
    pub serial: String,
    pub generation: u64,
    pub handshake: Handshake,
    pub control: bool,
    pub cancel: CancellationToken,
    pub started: Instant,
}

impl MediaLoop {
    pub async fn run(mut self) -> Result<(), MirrorError> {
        let mut header = [0u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH];
        let mut packets: u64 = 0;
        let mut saw_config = false;
        let mut saw_key = false;
        let mut width = self.handshake.width;
        let mut height = self.handshake.height;
        loop {
            tokio::select! {
                biased;
                _ = self.cancel.cancelled() => return Err(MirrorError::Cancelled),
                read = self.video.read_exact(&mut header) => {
                    read?;
                    match parse_header(&header).map_err(MirrorError::Protocol)? {
                        HeaderKind::Session { width: w, height: h } => {
                            width = w;
                            height = h;
                            emit::emit_live(
                                &self.sink,
                                &self.serial,
                                self.generation,
                                width,
                                height,
                                self.handshake.codec.name(),
                                self.control,
                            )
                            .await;
                        }
                        HeaderKind::Media { config, keyframe, pts, size } => {
                            if packets < 32 {
                                tracing::info!(
                                    serial = %self.serial,
                                    packets,
                                    size,
                                    config,
                                    keyframe,
                                    "读媒体包"
                                );
                            }
                            let mut payload = vec![0u8; size as usize];
                            read_exact_cancel(&mut self.video, &mut payload, &self.cancel).await?;
                            if config && !saw_config {
                                saw_config = true;
                                tracing::info!(
                                    serial = %self.serial,
                                    size,
                                    elapsed_ms = self.started.elapsed().as_millis() as u64,
                                    "收到 codec config"
                                );
                            }
                            if keyframe && !saw_key {
                                saw_key = true;
                                tracing::info!(
                                    serial = %self.serial,
                                    size,
                                    elapsed_ms = self.started.elapsed().as_millis() as u64,
                                    "收到关键帧"
                                );
                            }
                            self.frames.push(EncodedFrame {
                                generation: self.generation,
                                codec: self.handshake.codec.pipe_id(),
                                width,
                                height,
                                config,
                                keyframe,
                                pts,
                                payload,
                                dropped: 0,
                            });
                            packets += 1;
                            let dropped = self.frames.dropped();
                            if dropped > 0 && (dropped == 1 || dropped.is_multiple_of(50)) {
                                tracing::warn!(
                                    serial = %self.serial,
                                    dropped,
                                    packets,
                                    "投屏帧队列满，已丢非关键帧"
                                );
                            } else if packets == 1 || packets.is_multiple_of(120) {
                                tracing::info!(
                                    serial = %self.serial,
                                    packets,
                                    dropped,
                                    width,
                                    height,
                                    "投屏出包"
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}

async fn read_exact_cancel(
    stream: &mut TcpStream,
    buf: &mut [u8],
    cancel: &CancellationToken,
) -> Result<(), MirrorError> {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        r = stream.read_exact(buf) => {
            r?;
            Ok(())
        }
    }
}

async fn read_exact_timeout(
    stream: &mut TcpStream,
    buf: &mut [u8],
    cancel: &CancellationToken,
) -> Result<(), MirrorError> {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        _ = tokio::time::sleep(ACCEPT) => Err(MirrorError::Protocol("读取投屏握手超时".into())),
        r = stream.read_exact(buf) => {
            r?;
            Ok(())
        }
    }
}
