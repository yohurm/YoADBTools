//! L0：时钟与系统动效开关。合成器播动画时本进程只泵消息并等 DWM，禁止逐帧呈现。

use std::time::{Duration, Instant};

use windows::core::BOOL;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, PeekMessageW, SystemParametersInfoW, TranslateMessage, MSG, PM_REMOVE,
    SPI_GETCLIENTAREAANIMATION, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

const FRAME_FALLBACK_MS: u64 = 8;

pub fn motion_allowed() -> bool {
    unsafe {
        let mut enabled = BOOL(1);
        let ok = SystemParametersInfoW(
            SPI_GETCLIENTAREAANIMATION,
            0,
            Some((&mut enabled as *mut BOOL).cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
        ok.is_ok() && enabled.as_bool()
    }
}

pub fn vsync() {
    if unsafe { DwmFlush() }.is_err() {
        std::thread::sleep(Duration::from_millis(FRAME_FALLBACK_MS));
    }
}

pub fn pump(hwnd: HWND) {
    unsafe {
        let mut msg = MSG::default();
        for _ in 0..16 {
            while PeekMessageW(&mut msg, Some(hwnd), 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
}

/// 等合成器播完一段动画。不回调、不改 HWND。
pub fn wait(duration: Duration, a: HWND, b: HWND) {
    let start = Instant::now();
    loop {
        pump(a);
        if b != a {
            pump(b);
        }
        if start.elapsed() >= duration {
            break;
        }
        vsync();
    }
}
