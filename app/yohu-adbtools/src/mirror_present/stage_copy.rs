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
}
