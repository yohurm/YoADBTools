//! 指定 HWND 的消息泵。合成器播动画时本进程只泵消息，禁止逐帧呈现。

use std::time::{Duration, Instant};

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
};

use crate::clock::vsync;
use crate::spec::MotionSpec;

/// 抽空 `hwnd` 上已排队的消息。
///
/// `PeekMessage` 在该 HWND 队列空时返回 FALSE。`DispatchMessage` 同步跑窗口过程，
/// 过程里新 post 的消息仍由同一 while 抽走，因此一次调用即泵空。
/// 不设 livelock 上限：截断会把未处理消息留在队列里；窗口过程若循环 `InvalidateRect`
/// 应在产品侧修，不能靠运动原语丢消息。
pub fn pump(hwnd: HWND) {
    unsafe {
        let mut msg = MSG::default();
        while PeekMessageW(&mut msg, Some(hwnd), 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

/// 等 `spec` 时长播完。只泵这一个 HWND。
///
/// overlay 与 splash 需要同一时段都泵时，壳循环 `pump` 两个 HWND，再 `vsync`；
/// 禁止连续 `wait` 两次（会把时长加一倍）。
pub fn wait(spec: MotionSpec, hwnd: HWND) {
    let duration = Duration::from_millis(spec.duration_ms());
    let start = Instant::now();
    loop {
        pump(hwnd);
        if start.elapsed() >= duration {
            break;
        }
        vsync();
    }
}
