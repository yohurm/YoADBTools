//! 系统动效开关与合成器时钟。不含消息泵。

use std::time::Duration;

use windows::core::BOOL;
use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPI_GETCLIENTAREAANIMATION, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

/// `DwmFlush` 失败时的回退间隔。约 120 Hz（1000/120 ≈ 8.3ms），避免空转。
const VSYNC_FALLBACK_MS: u64 = 8;

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
        std::thread::sleep(Duration::from_millis(VSYNC_FALLBACK_MS));
    }
}
