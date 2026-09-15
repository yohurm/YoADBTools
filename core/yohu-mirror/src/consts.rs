//! 本 crate 操作超时与缓冲上限。线路字面量在 `yohu_protocol::scrcpy`。

use std::time::Duration;

pub const ACCEPT: Duration = Duration::from_secs(15);
pub const KILL_WAIT: Duration = Duration::from_secs(3);
pub const CONTROL_WRITE: Duration = Duration::from_secs(5);
pub const FORWARD_DUMMY: Duration = Duration::from_millis(200);
pub const FORWARD_RETRY: Duration = Duration::from_millis(100);
pub const TCP_RETRY: Duration = Duration::from_millis(50);

pub const FORWARD_ATTEMPTS: u32 = 100;
pub const CONTROL_CHAN: usize = 32;
pub const SERVER_LOG_CAP: usize = 32 * 1024;

pub const ADB_STAT_MS: u64 = 8_000;
pub const ADB_TUNNEL_MS: u64 = 10_000;
pub const ADB_REMOVE_MS: u64 = 5_000;
pub const ADB_PUSH_MS: u64 = 60_000;

pub const LOOPBACK_HOST: &str = "127.0.0.1";
pub const VIDEO_CODEC_OPTIONS: &str = "i-frame-interval=1";
/// scrcpy 4.1：按显示尺寸编码，失败再降。`max_size=0` 的本机分辨率契约。
pub const IGNORE_VIDEO_ENCODER_CONSTRAINTS: &str = "ignore_video_encoder_constraints=true";
