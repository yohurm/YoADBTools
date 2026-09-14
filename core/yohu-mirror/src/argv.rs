//! scrcpy-server 4.1 `app_process` 参数。

use yohu_protocol::scrcpy;

use crate::consts::VIDEO_CODEC_OPTIONS;
use crate::session::MirrorSessionRequest;

pub fn server_argv(req: &MirrorSessionRequest, scid: u32, forward: bool) -> Vec<String> {
    let mut kv = vec![
        format!("scid={scid:08x}"),
        "log_level=info".into(),
        "audio=false".into(),
        "video=true".into(),
        format!("video_codec={}", req.video_codec),
        format!("control={}", req.control),
        format!("max_size={}", req.max_size),
        format!("video_bit_rate={}", req.video_bit_rate),
        "cleanup=false".into(),
        "power_on=true".into(),
        format!("video_codec_options={VIDEO_CODEC_OPTIONS}"),
    ];
    if req.max_fps > 0 {
        kv.push(format!("max_fps={}", req.max_fps));
    }
    if forward {
        kv.push("tunnel_forward=true".into());
    }
    let joined = kv.join(" ");
    vec![
        "shell".into(),
        format!(
            "CLASSPATH={} app_process / com.genymobile.scrcpy.Server {} {joined}",
            scrcpy::DEVICE_SERVER_PATH,
            scrcpy::SERVER_VERSION
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(max_size: u32, max_fps: u32, codec: &str) -> MirrorSessionRequest {
        MirrorSessionRequest {
            serial: "S1".into(),
            control: true,
            force_forward: false,
            max_size,
            video_bit_rate: 4_000_000,
            max_fps,
            video_codec: codec.into(),
        }
    }

    #[test]
    fn argv_uses_request_limits_without_fps_when_zero() {
        let line = &server_argv(&req(0, 0, "h265"), 0x11, false)[1];
        assert!(line.contains("video_codec=h265"));
        assert!(line.contains("power_on=true"));
        assert!(line.contains("max_size=0"));
        assert!(line.contains("video_bit_rate=4000000"));
        assert!(!line.contains("max_fps="));
        assert!(!line.contains("tunnel_forward"));
        assert!(line.contains(scrcpy::SERVER_VERSION));
    }

    #[test]
    fn argv_forward_and_fps() {
        let line = &server_argv(&req(1280, 30, "h264"), 1, true)[1];
        assert!(line.contains("max_size=1280"));
        assert!(line.contains("max_fps=30"));
        assert!(line.contains("tunnel_forward=true"));
    }
}
