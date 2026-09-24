//! HTTP(S) 大文件落盘原语（ADR-v6-034）。
//!
//! 零产品 wire、零 GitHub、零 Tauri。调用方注入 URL、目标路径与 headers。

mod error;
mod fetch;
mod policy;
mod resume;
mod spec;
mod stream;
mod verify;

pub use resume::{resume_plan, ResumeAction};

pub use error::DownloadError;
pub use fetch::{fetch, DOWNLOAD_ATTEMPTS};
pub use policy::{assert_http_url, is_http_url};
pub use spec::{DownloadOutcome, DownloadPhase, DownloadProgress, DownloadSpec};
pub use verify::{sha256_hex, MAX_FILE_BYTES};
