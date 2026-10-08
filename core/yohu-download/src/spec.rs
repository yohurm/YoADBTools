//! 下载 DTO（不进 yohu-protocol）。

use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadSpec {
    pub url: String,
    pub dest: PathBuf,
    pub user_agent: String,
    pub headers: Vec<(String, String)>,
    pub expected_size: u64,
    pub expected_sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadPhase {
    Streaming,
    Verifying,
    Complete,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
    pub phase: DownloadPhase,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadOutcome {
    pub path: PathBuf,
    pub size_bytes: u64,
}
