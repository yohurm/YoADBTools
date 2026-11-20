//! 采集服务内部常量池：通道容量、重启退避与预算。禁止在业务分支散落数字。

use std::time::Duration;

/// 窗口命中通道容量（环 → 批量聚合）。
pub(crate) const HIT_CHANNEL_CAP: usize = 4096;
/// 原始行通道容量（adb stdout → 组装器）。
pub(crate) const LINE_CHANNEL_CAP: usize = 1024;

/// 同世代重启的首次退避（第一次可恢复失败后）。
pub(crate) const FOLLOW_RESTART_BACKOFF_MIN: Duration = Duration::from_millis(250);
/// 同世代重启的退避上限。
pub(crate) const FOLLOW_RESTART_BACKOFF_MAX: Duration = Duration::from_secs(8);
/// 连续可恢复失败达到这个次数即升级为永久失败（`Terminal`），停止重生。
pub(crate) const FOLLOW_ATTEMPT_LIMIT: u32 = 10;
