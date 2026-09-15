//! Windows 后端：Media Foundation + D3D11 + HWND（ADR-v6-024）。

pub mod chrome;
mod convert;
mod d3d;
mod decode;
pub mod follow;
pub mod gpu;
mod host;
pub mod mf;
mod occupancy;
mod present;
mod scale;
mod slot;
pub mod surface;
mod tex;
mod window;

pub const ID: &str = "media-foundation";

pub use d3d::D3dDevice;
pub use decode::DecodeSeat;
pub use follow::GeomHost;
pub use mf::{hevc_available, MfDecoder};
pub use slot::PictureBank;
pub use surface::spawn_surface;
