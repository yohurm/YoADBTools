//! yohu-motion — 原生动效原语（与 `yohu-runtime` / `yohu-protocol` 并列，互不依赖）。
//!
//! 公开面只有 `MotionSpec`（与 YoUI 同名同值）。Windows 另提供合成器时钟与 DComp 采样。
//! 禁止产品 HWND 树、wire 类型、设备、Tauri。

mod curve;
mod spec;

pub use spec::MotionSpec;

#[cfg(windows)]
mod clock;
#[cfg(windows)]
mod dcomp;
#[cfg(windows)]
mod geom;

#[cfg(windows)]
pub use clock::{motion_allowed, pump, wait};
#[cfg(windows)]
pub use dcomp::{ease_at, eased_anim};
#[cfg(windows)]
pub use geom::{rect_center, rect_height, rect_width, xywh};
