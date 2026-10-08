//! scrcpy 4.1 视频解复用（12 字节 BE 帧头；与官方 `demuxer.c` / `Streamer.java` 对齐）。

use yohu_protocol::scrcpy;

use crate::content_size_usable;
use crate::error::ProtocolFault;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeaderKind {
    Session {
        width: u32,
        height: u32,
    },
    Media {
        config: bool,
        keyframe: bool,
        pts: u64,
        size: u32,
    },
}

fn header_u32(header: &[u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH], offset: usize) -> u32 {
    u32::from_be_bytes(header[offset..offset + 4].try_into().expect("4 bytes"))
}

/// 解析 12 字节视频帧头。`PACKET_FLAG_SESSION` 为 session（无 payload）；否则为 media。
pub fn parse_header(
    header: &[u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH],
) -> Result<HeaderKind, ProtocolFault> {
    let pts_flags = u64::from_be_bytes(header[0..8].try_into().expect("8 bytes"));
    if pts_flags & scrcpy::PACKET_FLAG_SESSION != 0 {
        let width = header_u32(header, 4);
        let height = header_u32(header, 8);
        if !content_size_usable(width, height) {
            return Err(ProtocolFault::BadSessionSize { width, height });
        }
        return Ok(HeaderKind::Session { width, height });
    }
    let size = header_u32(header, 8);
    if size == 0 {
        return Err(ProtocolFault::EmptyMedia);
    }
    if size > scrcpy::MAX_PACKET_SIZE {
        return Err(ProtocolFault::MediaTooLarge { size });
    }
    let config = pts_flags & scrcpy::PACKET_FLAG_CONFIG != 0;
    let keyframe = pts_flags & scrcpy::PACKET_FLAG_KEY_FRAME != 0;
    let pts = if config {
        0
    } else {
        pts_flags & scrcpy::PACKET_PTS_MASK
    };
    Ok(HeaderKind::Media {
        config,
        keyframe,
        pts,
        size,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_header_be_width_height() {
        let mut h = [0u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH];
        h[0..8].copy_from_slice(&scrcpy::PACKET_FLAG_SESSION.to_be_bytes());
        h[4..8].copy_from_slice(&1080u32.to_be_bytes());
        h[8..12].copy_from_slice(&1920u32.to_be_bytes());
        match parse_header(&h).unwrap() {
            HeaderKind::Session { width, height } => {
                assert_eq!((width, height), (1080, 1920));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn media_header_config_and_key_flags() {
        let mut h = [0u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH];
        let pts_flags = scrcpy::PACKET_FLAG_CONFIG;
        h[0..8].copy_from_slice(&pts_flags.to_be_bytes());
        h[8..12].copy_from_slice(&16u32.to_be_bytes());
        match parse_header(&h).unwrap() {
            HeaderKind::Media {
                config,
                keyframe,
                pts,
                size,
            } => {
                assert!(config);
                assert!(!keyframe);
                assert_eq!(pts, 0);
                assert_eq!(size, 16);
            }
            other => panic!("{other:?}"),
        }

        let mut k = [0u8; scrcpy::VIDEO_PACKET_HEADER_LENGTH];
        let flags = 1_000u64 | scrcpy::PACKET_FLAG_KEY_FRAME;
        k[0..8].copy_from_slice(&flags.to_be_bytes());
        k[8..12].copy_from_slice(&4u32.to_be_bytes());
        match parse_header(&k).unwrap() {
            HeaderKind::Media {
                config,
                keyframe,
                pts,
                size,
            } => {
                assert!(!config);
                assert!(keyframe);
                assert_eq!(pts, 1_000);
                assert_eq!(size, 4);
            }
            other => panic!("{other:?}"),
        }
    }
}
