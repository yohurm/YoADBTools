//! 投屏错误。句子只写在对应类别上。

use yohu_adb::AdbError;

/// 视频流协议事实。不是运输 IO。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ProtocolFault {
    #[error("控制通道写入超时")]
    ControlWriteTimeout,
    #[error("等待设备连接超时")]
    DeviceConnectTimeout,
    #[error("forward 隧道连接失败")]
    ForwardTunnel,
    #[error("forward 控制通道连接失败")]
    ForwardControl,
    #[error("读取投屏握手超时")]
    HandshakeTimeout,
    #[error("首包不是 session 头")]
    NotSessionHeader,
    #[error("无效 session 尺寸: {width}x{height}")]
    BadSessionSize { width: u32, height: u32 },
    #[error("媒体包长度为 0")]
    EmptyMedia,
    #[error("媒体包过大: {size}")]
    MediaTooLarge { size: u32 },
}

/// 视频编码事实。未知编码失败，不默认成 H.264。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CodecFault {
    #[error("设备关闭了视频流")]
    StreamOff,
    #[error("设备视频配置失败")]
    ConfigFailed,
    #[error("不支持的视频编码 0x{0:08x}")]
    UnsupportedFourcc(u32),
    #[error("不支持的视频编码 {0}")]
    UnsupportedName(String),
}

/// 设备端 scrcpy-server 没能把隧道建起来。退出码是字段，stderr 不进这句。
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ServerFault {
    #[error("server 在建立隧道前退出")]
    ExitedBeforeTunnel,
    #[error("reverse 失败(退出码 {0})")]
    Reverse(i32),
    #[error("forward 失败(退出码 {0})")]
    Forward(i32),
    #[error("push server 失败(退出码 {0})")]
    Push(i32),
}

#[derive(Debug, thiserror::Error)]
pub enum MirrorError {
    #[error("投屏已取消")]
    Cancelled,
    #[error("缺少投屏组件")]
    ServerMissing,
    #[error(transparent)]
    Protocol(#[from] ProtocolFault),
    #[error(transparent)]
    Codec(#[from] CodecFault),
    #[error(transparent)]
    ServerFailed(#[from] ServerFault),
    #[error("当前会话为只读，无法注入控制")]
    NoControl,
    #[error("设备没有进行中的投屏")]
    NotLive,
    #[error("{0}")]
    Adb(#[from] AdbError),
    /// 句子见 [`yohu_runtime::io_error_text`]。不是 `AdbError::Io` 的公开句。
    #[error("{}", yohu_runtime::io_error_text(&.0.to_string()))]
    Io(#[from] std::io::Error),
}

impl MirrorError {
    /// 事件 / IPC 展示句。`BadExit` 不带 stderr（对齐 files `file_error_from_adb`）。
    pub fn public_message(&self) -> String {
        match self {
            Self::Adb(AdbError::BadExit { exit_code, .. }) => {
                format!("投屏设备命令失败(退出码 {exit_code})")
            }
            Self::Adb(AdbError::Io(_)) => "投屏设备通道失败".to_string(),
            other => other.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_message_strips_bad_exit_stderr() {
        let err = MirrorError::Adb(AdbError::BadExit {
            exit_code: 1,
            stderr: "ls: /secret: Permission denied".into(),
        });
        let text = err.public_message();
        assert_eq!(text, "投屏设备命令失败(退出码 1)");
        assert!(!text.contains("Permission denied"));
        assert!(!text.contains("/secret"));
    }

    #[test]
    fn public_message_keeps_shell_and_strips_only_io_payload() {
        let shell = MirrorError::Adb(AdbError::UnsupportedShell).public_message();
        assert_eq!(shell, AdbError::UnsupportedShell.to_string());

        let io = MirrorError::Adb(AdbError::Io(std::io::Error::other("open /secret/adb.sock")))
            .public_message();
        assert_eq!(io, "投屏设备通道失败");
        assert!(!io.contains("/secret"));
    }

    #[test]
    fn protocol_codec_and_server_sentences_are_the_fault() {
        assert_eq!(
            ProtocolFault::DeviceConnectTimeout.to_string(),
            "等待设备连接超时"
        );
        assert_eq!(CodecFault::StreamOff.to_string(), "设备关闭了视频流");
        assert_eq!(
            CodecFault::UnsupportedFourcc(0x0061_7631).to_string(),
            "不支持的视频编码 0x00617631"
        );
        assert_eq!(
            ServerFault::Reverse(1).to_string(),
            "reverse 失败(退出码 1)"
        );
        let shown = MirrorError::from(ProtocolFault::HandshakeTimeout).public_message();
        assert_eq!(shown, "读取投屏握手超时");
        assert!(!shown.contains("投屏协议错误"));
    }

    fn strip_owner_line(src: &str, needle: &str) -> String {
        let mut dropped = false;
        src.lines()
            .filter(|line| {
                if !dropped && line.contains(needle) {
                    dropped = true;
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn ban(all: &[(&str, &str)], owner: &str, needle: &str) {
        let owner_src = all
            .iter()
            .find(|(name, _)| *name == owner)
            .unwrap_or_else(|| panic!("missing {owner}"))
            .1;
        let rest = strip_owner_line(owner_src, needle);
        assert!(
            !rest.contains(needle),
            "{needle} remains in {owner} after the owner line"
        );
        for (name, src) in all {
            if *name == owner {
                continue;
            }
            assert!(!src.contains(needle), "{needle} in {name}");
        }
    }

    fn absent(all: &[(&str, &str)], needle: &str) {
        for (name, src) in all {
            assert!(!src.contains(needle), "{needle} in {name}");
        }
    }

    #[test]
    fn cut_mirror_judgments_stay_with_owner() {
        let all = [
            ("argv", include_str!("argv.rs")),
            ("codec", include_str!("codec.rs")),
            ("consts", include_str!("consts.rs")),
            ("control", include_str!("control.rs")),
            ("demux", include_str!("demux.rs")),
            ("emit", include_str!("emit.rs")),
            ("frame", include_str!("frame.rs")),
            ("pump", include_str!("pump.rs")),
            ("service", include_str!("service.rs")),
            ("session", include_str!("session.rs")),
            ("slot", include_str!("slot.rs")),
            ("tunnel", include_str!("tunnel.rs")),
            ("warm", include_str!("warm.rs")),
        ];
        ban(&all, "tunnel", "process_alive.load");
        ban(&all, "tunnel", "exit_code != 0");
        ban(&all, "tunnel", "set_nodelay");
        ban(&all, "tunnel", "tcp:{port}");
        ban(&all, "tunnel", "{scid:08x}");
        ban(&all, "control", "action == scrcpy::ACTION_UP");
        absent(&all, "Some(Phase::Starting | Phase::Stopping)");
        absent(&all, "slot.generation ==");
        absent(&all, "header[8], header[9], header[10], header[11]");
        absent(&all, "header[4], header[5], header[6], header[7]");
    }
}
