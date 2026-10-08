//! 投屏触控。指针种类、占用映射和注入只在这里。
//! Windows 与 macOS 宿主只提供舞台几何。

use std::sync::Arc;

use yohu_mirror::MirrorService;
use yohu_protocol::{MirrorControlMessage, MirrorPointerKind};

use super::pointer::{PointerGesture, PointerKind, TouchOut};
use super::scale::{map_client_to_video, Letterbox};
use super::stage::Stage;

pub struct ControlHand {
    gesture: PointerGesture,
    mirror: Arc<MirrorService>,
}

pub struct PointerTarget {
    pub serial: String,
    pub control: bool,
    pub dest: Letterbox,
    pub video_w: u32,
    pub video_h: u32,
}

/// 布局刚写完：不可操作就抬起。可操作时按住不动。
pub fn lift_without_control(stage: &Stage, hand: &mut ControlHand) -> bool {
    if stage.control() {
        return false;
    }
    hand.end_press(&stage.serial);
    true
}

/// 舞台上的指针交给触控手。宿主不再自己取目标。
pub fn deliver_pointer(
    stage: &Stage,
    hand: &mut ControlHand,
    kind: MirrorPointerKind,
    x: i32,
    y: i32,
) {
    let target = pointer_target(stage);
    hand.wire(kind, x, y, &target);
}

/// 抬起当前按压。序列号跟舞台走，宿主不再先克隆再传入。
pub fn lift_press(stage: &Stage, hand: &mut ControlHand) {
    hand.end_press(&stage.serial);
}

pub fn pointer_target(stage: &Stage) -> PointerTarget {
    let (video_w, video_h) = stage.video_size();
    PointerTarget {
        serial: stage.serial.clone(),
        control: stage.control(),
        dest: stage.dest(),
        video_w,
        video_h,
    }
}

/// 只可操作时映射进画面。不可操作则抬起。离开占用面也抬起。
#[allow(clippy::too_many_arguments)]
pub fn plan_wire(
    gesture: &mut PointerGesture,
    kind: MirrorPointerKind,
    x: i32,
    y: i32,
    control: bool,
    dest: Letterbox,
    video_w: u32,
    video_h: u32,
) -> Option<TouchOut> {
    match kind {
        MirrorPointerKind::Leave => gesture.feed(PointerKind::Leave, None, 0, 0),
        MirrorPointerKind::Down => plan_feed(gesture, PointerKind::Down, x, y, control, dest, video_w, video_h),
        MirrorPointerKind::Move => plan_feed(gesture, PointerKind::Move, x, y, control, dest, video_w, video_h),
        MirrorPointerKind::Up => plan_feed(gesture, PointerKind::Up, x, y, control, dest, video_w, video_h),
    }
}

#[allow(clippy::too_many_arguments)]
fn plan_feed(
    gesture: &mut PointerGesture,
    kind: PointerKind,
    x: i32,
    y: i32,
    control: bool,
    dest: Letterbox,
    video_w: u32,
    video_h: u32,
) -> Option<TouchOut> {
    if !control {
        return gesture.cancel();
    }
    let mapped = map_client_to_video(x, y, dest, video_w, video_h);
    gesture.feed(kind, mapped, video_w, video_h)
}

impl ControlHand {
    pub fn new(mirror: Arc<MirrorService>) -> Self {
        Self {
            gesture: PointerGesture::default(),
            mirror,
        }
    }

    pub fn end_press(&mut self, serial: &str) {
        if let Some(out) = self.gesture.cancel() {
            self.inject(serial, out);
        }
    }

    pub fn wire(&mut self, kind: MirrorPointerKind, x: i32, y: i32, target: &PointerTarget) {
        if let Some(out) = plan_wire(
            &mut self.gesture,
            kind,
            x,
            y,
            target.control,
            target.dest,
            target.video_w,
            target.video_h,
        ) {
            self.inject(&target.serial, out);
        }
    }

    fn inject(&self, serial: &str, out: TouchOut) {
        let serial = serial.to_string();
        let mirror = Arc::clone(&self.mirror);
        let message = MirrorControlMessage::Touch {
            action: out.action,
            x: out.x,
            y: out.y,
            width: out.width,
            height: out.height,
        };
        tauri::async_runtime::spawn(async move {
            let _ = mirror.inject(&serial, message).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mirror_present::pointer::TOUCH_DOWN;
    use crate::mirror_present::pointer::TOUCH_UP;

    fn box_at_origin() -> Letterbox {
        Letterbox {
            x: 0,
            y: 0,
            width: 100,
            height: 200,
            nearest: true,
            crop_w: 100,
            crop_h: 200,
        }
    }

    #[test]
    fn lost_control_lifts_at_the_last_point() {
        let mut gesture = PointerGesture::default();
        let down = plan_wire(
            &mut gesture,
            MirrorPointerKind::Down,
            10,
            20,
            true,
            box_at_origin(),
            100,
            200,
        )
        .expect("down");
        assert_eq!(down.action, TOUCH_DOWN);
        let up = plan_wire(
            &mut gesture,
            MirrorPointerKind::Move,
            11,
            21,
            false,
            box_at_origin(),
            100,
            200,
        )
        .expect("lift");
        assert_eq!(up.action, TOUCH_UP);
        assert_eq!((up.x, up.y), (10, 20));
    }

    #[test]
    fn leave_lifts_without_a_new_point() {
        let mut gesture = PointerGesture::default();
        let _ = plan_wire(
            &mut gesture,
            MirrorPointerKind::Down,
            10,
            20,
            true,
            box_at_origin(),
            100,
            200,
        );
        let up = plan_wire(
            &mut gesture,
            MirrorPointerKind::Leave,
            0,
            0,
            true,
            box_at_origin(),
            100,
            200,
        )
        .expect("leave");
        assert_eq!(up.action, TOUCH_UP);
        assert_eq!((up.x, up.y), (10, 20));
    }

    #[test]
    fn idle_loss_of_control_sends_nothing() {
        let mut gesture = PointerGesture::default();
        assert!(plan_wire(
            &mut gesture,
            MirrorPointerKind::Down,
            10,
            20,
            false,
            box_at_origin(),
            100,
            200,
        )
        .is_none());
    }

    fn layout(control: bool) -> yohu_protocol::MirrorLayout {
        yohu_protocol::MirrorLayout {
            serial: "S1".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 200,
            visible: true,
            dpr: 1.0,
            fullscreen: false,
            paused: false,
            control,
            has_device: true,
            failed: false,
            error: String::new(),
            dark: false,
        }
    }

    fn idle_hand() -> ControlHand {
        use std::sync::Arc;
        let (tx, _rx) = tokio::sync::mpsc::channel(1);
        let mirror = yohu_mirror::MirrorService::new(
            Arc::new(yohu_adb::AdbClient::new(
                yohu_adb::ToolResolver::new(None, std::env::temp_dir(), std::env::temp_dir()),
                1,
            )),
            tx,
            std::env::temp_dir(),
            tokio_util::sync::CancellationToken::new(),
        );
        ControlHand::new(mirror)
    }

    #[test]
    fn lift_without_control_holds_while_operable() {
        let mut hand = idle_hand();
        let mut stage = Stage::new("S1".into());
        stage.apply_layout(&layout(true));
        stage.bind("S1".into(), 1);
        stage.set_video_size(10, 20);
        stage.mark_frame();
        assert!(stage.control());
        assert!(!lift_without_control(&stage, &mut hand));
        stage.apply_layout(&layout(false));
        assert!(!stage.control());
        assert!(lift_without_control(&stage, &mut hand));
    }

    #[test]
    fn stage_pointer_is_delivered_once() {
        let mut hand = idle_hand();
        let mut stage = Stage::new("S1".into());
        stage.apply_layout(&layout(false));
        deliver_pointer(&stage, &mut hand, MirrorPointerKind::Down, 1, 2);
        lift_press(&stage, &mut hand);
        let windows = include_str!("windows/host.rs");
        let macos = include_str!("macos/host.rs");
        assert!(!windows.contains("pointer_target("));
        assert!(!macos.contains("pointer_target("));
        assert!(!windows.contains("self.hand.end_press"));
        assert!(!macos.contains("self.hand.end_press"));
    }
}
