//! 舞台文案。与色板、模型分文件。空面板标题用领域 `DEVICE_UNSELECTED`。

use yohu_domain::DEVICE_UNSELECTED;
use yohu_protocol::MirrorStageMode;

pub fn stage_copy(
    mode: MirrorStageMode,
    has_device: bool,
    failed: bool,
    error: &str,
    has_video_size: bool,
) -> (&'static str, String) {
    match mode {
        MirrorStageMode::Video => ("", String::new()),
        MirrorStageMode::Paused => ("已暂停", "画面已隐藏，点击继续".into()),
        MirrorStageMode::Loading => {
            if has_video_size {
                ("等待画面", "设备正在准备编码器，画面到达前请稍候".into())
            } else {
                ("启动中", "正在推送 server 并建立隧道".into())
            }
        }
        MirrorStageMode::Empty => empty_copy(has_device, failed, error),
    }
}

/// 呈现绑定失败。会话可以已经 Live，所以标题不是「启动失败」。
pub fn present_unavailable_copy(error: &str) -> (&'static str, String) {
    ("没有画面", error.to_string())
}

/// 没有原生表面时，会话失败才把 `stage_copy` 交给洞。有表面、未失败、或没有正文则不画。
pub fn session_failure_hole(
    native_surface: bool,
    failed: bool,
    error: &str,
) -> Option<(&'static str, String)> {
    if native_surface || !failed || error.is_empty() {
        return None;
    }
    Some(stage_copy(
        MirrorStageMode::Empty,
        true,
        true,
        error,
        false,
    ))
}

fn empty_copy(has_device: bool, failed: bool, error: &str) -> (&'static str, String) {
    if !has_device {
        (DEVICE_UNSELECTED, "在左侧设备栏选择一台在线设备".into())
    } else if !error.is_empty() {
        let title = if failed { "启动失败" } else { "已停止" };
        (title, error.to_string())
    } else {
        ("未开始", "点击开始将画面嵌在此面板内".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_without_device_uses_unselected_title() {
        let (title, _) = stage_copy(MirrorStageMode::Empty, false, false, "", false);
        assert_eq!(title, DEVICE_UNSELECTED);
        let src = include_str!("stage_copy.rs");
        assert_eq!(src.matches(DEVICE_UNSELECTED).count(), 0);
    }

    #[test]
    fn present_failure_is_not_start_failure_or_idle() {
        let (title, body) = present_unavailable_copy("当前平台没有投屏硬解");
        assert_eq!(title, "没有画面");
        assert_eq!(body, "当前平台没有投屏硬解");
        assert_ne!(title, "启动失败");
        assert_ne!(title, "未开始");
        let (start, _) = stage_copy(
            MirrorStageMode::Empty,
            true,
            true,
            "等待设备连接超时",
            false,
        );
        assert_eq!(start, "启动失败");
    }

    #[test]
    fn session_hole_only_without_native_surface() {
        let hole = session_failure_hole(false, true, "等待设备连接超时").expect("hole");
        assert_eq!(hole.0, "启动失败");
        assert_eq!(hole.1, "等待设备连接超时");
        assert!(session_failure_hole(true, true, "等待设备连接超时").is_none());
        assert!(session_failure_hole(false, false, "等待设备连接超时").is_none());
        assert!(session_failure_hole(false, true, "").is_none());
    }
}
