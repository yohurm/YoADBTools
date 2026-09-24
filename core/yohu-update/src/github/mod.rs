//! GitHub Releases 检查：对齐 electron-updater / Tauri 纪律，**默认不走 REST API**。
//!
//! 顺序（每步成功即返回）：
//! 1. 静态 manifest — `releases/latest/download/update-manifest.json`（或 `latest.json`）
//! 2. Atom — `releases.atom` → tag → 同 tag 的 manifest 或约定文件名直链
//! 3. Web Latest — `github.com/.../releases/latest` + `Accept: application/json` → tag → manifest / 直链
//! 4. REST — `api.github.com/.../releases/latest`（可选 token、If-None-Match），最后兜底

mod api;
mod atom;
mod http;
mod manifest;
mod provider;
mod source;
mod urls;
mod web_latest;

pub use provider::GitHubReleaseProvider;
pub use source::{GitHubReleaseSource, DEFAULT_OWNER, DEFAULT_REPO};
