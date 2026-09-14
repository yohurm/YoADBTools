//! yohu-mirror — 官方 scrcpy-server 4.1 + 自写桌面客户端。
//!
//! 依赖方向：yohu-mirror → yohu-adb / yohu-runtime → yohu-protocol。
//! 零 Tauri。编码包经 [`FramePipe`] 交给壳内呈现（ADR-v6-024）。

mod argv;
mod codec;
mod consts;
mod control;
mod demux;
mod emit;
mod error;
mod frame;
mod pump;
mod service;
mod session;
mod slot;
mod tunnel;
mod warm;

pub use codec::{PIPE_H264, PIPE_H265};
pub use error::MirrorError;
pub use frame::{EncodedFrame, FramePipe};
pub use service::MirrorService;
pub use session::MirrorSessionRequest;
