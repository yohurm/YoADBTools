//! 壳装配上限：事件队列、应用日志环、投屏空闲拍、截图等待、呈现节拍。
//! 禁止在 lib / PresentHost / 呈现线程再写散落数字。

use std::time::Duration;

/// `AppEvent` 有界通道容量。溢出丢推送不丢环。
pub const EVENT_CHANNEL_CAP: usize = 8192;
/// 应用操作日志内存环（ADR-v6-010，不落盘）。
pub const APP_LOG_CAP: usize = 500;
/// 呈现线程无命令时的等待。
pub const PRESENT_IDLE: Duration = Duration::from_millis(4);
/// 呈现泵单轮最多取出的窗口消息数。
pub const PRESENT_PUMP_BATCH: u32 = 32;
/// 命令组进度事件通道容量。
pub const GROUP_EVENT_CHANNEL_CAP: usize = 64;
/// 加载环每步间隔（Win / mac 共用）。
pub const PRESENT_SPIN_STEP: Duration = Duration::from_millis(50);
/// 加载环每步弧度（Win / mac 共用）。
pub const PRESENT_SPIN_DELTA: f32 = 0.28;
/// 呈现节拍与已绘 fps 窗口（Win / mac 共用）。
pub const PRESENT_BEAT: Duration = Duration::from_secs(1);
/// `mirror.screenshot` 等呈现线程回执的上限。
pub const SCREENSHOT_TIMEOUT: Duration = Duration::from_secs(5);
/// 引导 HWND / `Gpu::new` 的初始边长（首帧 layout 到达前占位，勿与 `MIRROR_MIN_LAYOUT_PX` 混用）。
pub const PRESENT_BOOTSTRAP_PX: u32 = 16;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_caps_are_stable() {
        assert_eq!(EVENT_CHANNEL_CAP, 8192);
        assert_eq!(APP_LOG_CAP, 500);
        assert_eq!(PRESENT_IDLE, Duration::from_millis(4));
        assert_eq!(PRESENT_PUMP_BATCH, 32);
        assert_eq!(GROUP_EVENT_CHANNEL_CAP, 64);
        assert_eq!(PRESENT_SPIN_STEP, Duration::from_millis(50));
        assert!((PRESENT_SPIN_DELTA - 0.28).abs() < f32::EPSILON);
        assert_eq!(PRESENT_BEAT, Duration::from_secs(1));
        assert_eq!(SCREENSHOT_TIMEOUT, Duration::from_secs(5));
        assert_eq!(PRESENT_BOOTSTRAP_PX, 16);
    }
}
