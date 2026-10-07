//! 产品编码单源：fourcc ↔ 名称 ↔ FramePipe id。未知失败，禁止默认成 H.264。

use yohu_protocol::scrcpy;

use crate::error::{CodecFault, MirrorError};

/// FramePipe / 壳解码器识别的编码 id（H.264=0，H.265=1）。
pub const PIPE_H264: u8 = 0;
pub const PIPE_H265: u8 = 1;

pub const NAME_H264: &str = "h264";
pub const NAME_H265: &str = "h265";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodec {
    H264,
    H265,
}

impl VideoCodec {
    pub fn from_fourcc(id: u32) -> Result<Self, MirrorError> {
        match id {
            scrcpy::CODEC_H264 => Ok(Self::H264),
            scrcpy::CODEC_H265 => Ok(Self::H265),
            scrcpy::CODEC_DUMMY_OFF => Err(CodecFault::StreamOff.into()),
            scrcpy::CODEC_DUMMY_ERROR => Err(CodecFault::ConfigFailed.into()),
            other => Err(CodecFault::UnsupportedFourcc(other).into()),
        }
    }

    pub fn from_name(name: &str) -> Result<Self, MirrorError> {
        if name.eq_ignore_ascii_case(NAME_H264) {
            Ok(Self::H264)
        } else if name.eq_ignore_ascii_case(NAME_H265) {
            Ok(Self::H265)
        } else {
            Err(CodecFault::UnsupportedName(name.to_string()).into())
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::H264 => NAME_H264,
            Self::H265 => NAME_H265,
        }
    }

    pub fn pipe_id(self) -> u8 {
        match self {
            Self::H264 => PIPE_H264,
            Self::H265 => PIPE_H265,
        }
    }
}

/// 仅编码失败可同会话改 H.264。隧道超时等运输 `Protocol` 不换编码。
pub fn hevc_should_fallback(requested_h265: bool, tried_h264: bool, err: &MirrorError) -> bool {
    requested_h265
        && !tried_h264
        && matches!(err, MirrorError::ServerFailed(_) | MirrorError::Codec(_))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fourcc_maps_product_codecs_only() {
        assert_eq!(
            VideoCodec::from_fourcc(scrcpy::CODEC_H264).unwrap(),
            VideoCodec::H264
        );
        assert_eq!(
            VideoCodec::from_fourcc(scrcpy::CODEC_H265).unwrap(),
            VideoCodec::H265
        );
        assert!(VideoCodec::from_fourcc(scrcpy::CODEC_AV1).is_err());
        assert!(VideoCodec::from_fourcc(0x0076_7038).is_err());
        assert!(VideoCodec::from_fourcc(0x0076_7039).is_err());
        assert!(VideoCodec::from_fourcc(scrcpy::CODEC_DUMMY_OFF)
            .unwrap_err()
            .to_string()
            .contains("关闭"));
        assert!(VideoCodec::from_fourcc(scrcpy::CODEC_DUMMY_ERROR)
            .unwrap_err()
            .to_string()
            .contains("配置"));
    }

    #[test]
    fn name_rejects_unknown_instead_of_h264() {
        assert_eq!(VideoCodec::from_name("h264").unwrap().pipe_id(), PIPE_H264);
        assert_eq!(VideoCodec::from_name("h265").unwrap().pipe_id(), PIPE_H265);
        assert_eq!(VideoCodec::from_name("H265").unwrap().pipe_id(), PIPE_H265);
        assert!(VideoCodec::from_name("hevc").is_err());
        assert!(VideoCodec::from_name("HEVC").is_err());
        assert!(VideoCodec::from_name("av1").is_err());
        assert!(VideoCodec::from_name("vp8").is_err());
        assert!(VideoCodec::from_name("vp9").is_err());
        assert!(VideoCodec::from_name("mpeg").is_err());
    }

    #[test]
    fn hevc_falls_back_once_on_codec_error() {
        assert!(hevc_should_fallback(
            true,
            false,
            &MirrorError::ServerFailed(crate::error::ServerFault::ExitedBeforeTunnel)
        ));
        assert!(hevc_should_fallback(
            true,
            false,
            &MirrorError::Codec(CodecFault::ConfigFailed)
        ));
        assert!(!hevc_should_fallback(
            true,
            true,
            &MirrorError::ServerFailed(crate::error::ServerFault::ExitedBeforeTunnel)
        ));
        assert!(!hevc_should_fallback(
            false,
            false,
            &MirrorError::ServerFailed(crate::error::ServerFault::ExitedBeforeTunnel)
        ));
        assert!(!hevc_should_fallback(true, false, &MirrorError::Cancelled));
        assert!(!hevc_should_fallback(
            true,
            false,
            &MirrorError::Protocol(crate::error::ProtocolFault::DeviceConnectTimeout)
        ));
        assert!(!hevc_should_fallback(
            true,
            false,
            &MirrorError::Protocol(crate::error::ProtocolFault::ForwardTunnel)
        ));
        assert!(!hevc_should_fallback(
            true,
            false,
            &MirrorError::Protocol(crate::error::ProtocolFault::HandshakeTimeout)
        ));
        assert!(!hevc_should_fallback(
            true,
            false,
            &MirrorError::Io(std::io::Error::other("broken pipe"))
        ));
    }
}
